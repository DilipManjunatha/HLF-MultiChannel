#!/bin/bash

export PATH=${PWD}/../bin:${PWD}:$PATH
export FABRIC_CFG_PATH=${PWD}
export VERBOSE=false

# TODO - Create validator function for user input JSON file
# SYS_CHANNEL="byfn-sys-channel"
SYS_CHANNEL=$(jq '.SystemChannel' UserInput2.json | tr -d '"')
CHANNELS=$(jq '.Channels | length' UserInput2.json)

function exportPeerPorts() {
  
  for ((org=0; org<$ORGS; org++)) do
        PEERS=$(jq ".AllOrgs[$org].peers" UserInput.json)
        for ((peer=0; peer<$PEERS; peer++)) do
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

function createGenesisBlock () {
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

function channelList () {
  MODE=$1
  
  for ((ch=0; ch<$CHANNELS; ch++)) 
  do
      CHANNEL_NAME=$(jq ".Channels[$ch].ChannelName" UserInput2.json | tr -d '"')
      PROFILE_NAME=$CHANNEL_NAME"Profile"
      ORGS=$(jq ".Channels[$ch].Organizations | length" UserInput2.json)
      ./functions.sh $MODE $ORGS $CHANNEL_NAME $PROFILE_NAME $ch
  done
}

MODE=$1

if [ "${MODE}" == "up" ]; then
  channelList up
elif [ "${MODE}" == "down" ]; then ## Clear the network
  channelList down
elif [ "${MODE}" == "gen" ]; then ## Generate Artifacts
  createYamlAndCerts
  createGenesisBlock
  channelList gen
elif [ "${MODE}" == "restart" ]; then ## Restart the network
  channelList restart
else
  echo "Please use the mode on the script :)"
  exit 1
fi