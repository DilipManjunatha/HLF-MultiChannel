#!/bin/bash

export PATH=${PWD}/bin:${PWD}:$PATH
export FABRIC_CFG_PATH=${PWD}
export VERBOSE=false

MODE=$1

# TODO - Create validator function for user input JSON file
SYS_CHANNEL=$(jq '.SystemChannel' UserInput.json | tr -d '"')
CHANNELS=$(jq '.Channels | length' UserInput.json)

function printHelp() {
  echo "Usage: "
  echo "  hlf-automation.sh <mode>"
  echo "    <mode> - one of 'up', 'down', 'generate'"
  echo "      - 'up' - bring up the network with docker-compose up"
  echo "      - 'down' - clear the network with docker-compose down"
  echo "      - 'restart' - restart the network"
  echo "      - 'generate' - generate required certificates and genesis block"
  }

function exportPeerPorts() {

  for ((org = 0; org < $ORGS; org++)); do
    PEERS=$(jq ".AllOrgs[$org].peers" UserInput.json)
    for ((peer = 0; peer < $PEERS; peer++)); do
      export PEER${peer}_ORG${org}_PORT=$(jq ".AllOrgs[$org].peerPorts[$peer]" UserInput.json)
      port=PEER${peer}_ORG${org}_PORT
      echo "$port = ${!port}"
    done
  done
}

function createArtifactYamlFiles() {
  node artifact-yaml-gen.js
}

function createDockerYaml() {
  node docker-yaml-gen.js
}

function createYamlAndCerts() {
  # exportPeerPorts
  which cryptogen
  if [ "$?" -ne 0 ]; then
    echo "cryptogen tool not found. exiting"
    exit 1
  fi
  echo
  echo "##########################################################"
  echo "##### Generate certificates using cryptogen tool #########"
  echo "##########################################################"

  if [ -d "crypto-config" ]; then
    rm -Rf crypto-config
  fi

  createArtifactYamlFiles
  set -x
  cryptogen generate --config=./crypto-config.yaml
  res=$?
  set +x
  if [ $res -ne 0 ]; then
    echo "Failed to generate certificates..."
    exit 1
  fi
  createDockerYaml
}

function createGenesisBlock() {
  echo "##########################################################"
  echo "#########  Generating Orderer Genesis block ##############"
  echo "##########################################################"

  set -x
  configtxgen -profile FirstOrdererGenesis -channelID $SYS_CHANNEL -outputBlock ./channel-artifacts/genesis.block

  res=$?
  set +x
  if [ $res -ne 0 ]; then
    echo "Failed to generate orderer genesis block..."
    exit 1
  fi
}


function generateChannelArtifacts() {
  which configtxgen
  if [ "$?" -ne 0 ]; then
    echo "configtxgen tool not found. exiting"
    exit 1
  fi
  echo "#####################################################################"
  echo "### Generating channel configuration transaction $CHANNEL_NAME.tx ###"
  echo "#####################################################################"
  set -x
  configtxgen -profile $PROFILE_NAME -outputCreateChannelTx ./channel-artifacts/$CHANNEL_NAME.tx -channelID $CHANNEL_NAME
  res=$?
  set +x
  if [ $res -ne 0 ]; then
    echo "Failed to generate channel configuration transaction..."
    exit 1
  fi

  for ((org = 0; org < $ORGS; org++)); do
    ORG_NAME=$(jq ".Channels[$CHANNEL].Organizations[$org].name" UserInput.json | tr -d '"')
    echo
    echo "#################################################################"
    echo "#######    Generating anchor peer update for ${ORG_NAME}MSP   ##########"
    echo "#################################################################"
    set -x
    configtxgen -profile $PROFILE_NAME -outputAnchorPeersUpdate ./channel-artifacts/${ORG_NAME}MSPanchors_${CHANNEL_NAME}.tx -channelID $CHANNEL_NAME -asOrg ${ORG_NAME}MSP
    res=$?
    set +x
    if [ $res -ne 0 ]; then
      echo "Failed to generate anchor peer update for ${ORG_NAME}MSP..."
      exit 1
    fi
  done

  echo
  echo "#################################################################################"
  echo "######## Crypto material generation completed for channel : $CHANNEL_NAME #######"
  echo "#################################################################################"
}

function channelList() {
  MODE=$1

  for ((ch = 0; ch < $CHANNELS; ch++)); do
    CHANNEL_NAME=$(jq ".Channels[$ch].ChannelName" UserInput.json | tr -d '"')
    PROFILE_NAME=$CHANNEL_NAME"Profile"
    ORGS=$(jq ".Channels[$ch].Organizations | length" UserInput.json)
    ./functions.sh $MODE $ORGS $CHANNEL_NAME $PROFILE_NAME $ch
  done
}


function clearContainers() {
  CONTAINER_IDS=$(docker ps -a | awk '($2 ~ /dev-peer.*._cc.*/) {print $1}')
  if [ -z "$CONTAINER_IDS" -o "$CONTAINER_IDS" == " " ]; then
    echo "---- No containers available for deletion ----"
  else
    docker rm -f $CONTAINER_IDS
  fi
}

function removeUnwantedImages() {
  DOCKER_IMAGE_IDS=$(docker images | awk '($1 ~ /dev-peer.*._cc.*/) {print $3}')
  if [ -z "$DOCKER_IMAGE_IDS" -o "$DOCKER_IMAGE_IDS" == " " ]; then
    echo "---- No images available for deletion ----"
  else
    docker rmi -f $DOCKER_IMAGE_IDS
  fi
}

function networkDown() {
  docker-compose -f docker-compose-cli.yaml down --volumes --remove-orphans

  # Don't remove the generated artifacts -- note, the ledgers are always removed
  if [ "$MODE" != "restart" ]; then
    # Bring down the network, deleting the volumes
    #Cleanup the chaincode containers
    clearContainers
    #Cleanup images
    removeUnwantedImages
    # remove orderer block and other channel configuration transactions and certs
    rm -rf channel-artifacts/*.block channel-artifacts/*.tx crypto-config
    # remove the yaml files that was customized to the example
    rm -f crypto-config.yaml configtx.yaml base/docker-compose-base docker-compose-cli.yaml

  fi
}

function replacePrivateKey() {
  CURRENT_DIR=$PWD
  cd crypto-config/peerOrganizations/org$i.example.com/ca/
  PRIV_KEY=$(ls *_sk)
  cd "$CURRENT_DIR"
  sed -i "s/CA${i}_PRIVATE_KEY/${PRIV_KEY}/g" peer${j}_org${i}.yaml
}

if [ "${MODE}" == "up" ]; then
  channelList up
elif [ "${MODE}" == "down" ]; then ## Clear the network
  networkDown
elif [ "${MODE}" == "generate" ]; then ## Generate Artifacts
  createYamlAndCerts
  createGenesisBlock
  channelList generate
elif [ "${MODE}" == "restart" ]; then
  networkDown
  channelList up
else
  printHelp
  exit 1
fi
