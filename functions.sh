
MODE="$1"
ORGS="$2"
CHANNEL_NAME="$3"
PROFILE_NAME="$4"
CHANNEL="$5"
IMAGETAG="latest"




function checkPrereqs() {
  # Note, we check configtxlator externally because it does not require a config file, and peer in the
  # docker image because of FAB-8551 that makes configtxlator return 'development version' in docker
  LOCAL_VERSION=$(configtxlator version | sed -ne 's/ Version: //p')
  DOCKER_IMAGE_VERSION=$(docker run --rm hyperledger/fabric-tools:$IMAGETAG peer version | sed -ne 's/ Version: //p' | head -1)

  echo "LOCAL_VERSION=$LOCAL_VERSION"
  echo "DOCKER_IMAGE_VERSION=$DOCKER_IMAGE_VERSION"

  if [ "$LOCAL_VERSION" != "$DOCKER_IMAGE_VERSION" ]; then
    echo "=================== WARNING ==================="
    echo "  Local fabric binaries and docker images are  "
    echo "  out of  sync. This may cause problems.       "
    echo "==============================================="
  fi

  for UNSUPPORTED_VERSION in $BLACKLISTED_VERSIONS; do
    echo "$LOCAL_VERSION" | grep -q $UNSUPPORTED_VERSION
    if [ $? -eq 0 ]; then
      echo "ERROR! Local Fabric binary version of $LOCAL_VERSION is unsupported. Either move to a later version of Fabric or checkout an earlier version of fabric-samples."
      exit 1
    fi

    echo "$DOCKER_IMAGE_VERSION" | grep -q $UNSUPPORTED_VERSION
    if [ $? -eq 0 ]; then
      echo "ERROR! Fabric Docker image version of $DOCKER_IMAGE_VERSION does not match this newer version of BYFN and is unsupported. Either move to a later version of Fabric or checkout an earlier version of fabric-samples."
      exit 1
    fi
  done
}

#-----------------------------------------------------------

function generateChannelArtifacts() {
  which configtxgen
  if [ "$?" -ne 0 ]; then
    echo "configtxgen tool not found. exiting"
    exit 1
  fi

  echo "#################################################################"
  echo "### Generating channel configuration transaction '$CHANNEL_NAME.tx' ###"
  echo "#################################################################"
  set -x
  configtxgen -profile $PROFILE_NAME -outputCreateChannelTx ./channel-artifacts/$CHANNEL_NAME.tx -channelID $CHANNEL_NAME
  res=$?
  set +x
  if [ $res -ne 0 ]; then
    echo "Failed to generate channel configuration transaction..."
    exit 1
  fi

  for ((org=0; org<$ORGS; org++))
  do
    ORG_NAME=$(jq ".Channels[$CHANNEL].Organizations[$org].name" UserInput2.json | tr -d '"')
    echo "#################################################################"
    echo "#######    Generating anchor peer update for ${ORG_NAME}MSP   ##########"
    echo "#################################################################"
    set -x
    configtxgen -profile $PROFILE_NAME -outputAnchorPeersUpdate ./channel-artifacts/${ORG_NAME}MSPanchors.tx -channelID $CHANNEL_NAME -asOrg ${ORG_NAME}MSP
    res=$?
    set +x
    if [ $res -ne 0 ]; then
      echo "Failed to generate anchor peer update for ${ORG_NAME}MSP..."
      exit 1
    fi
  done

  echo
  echo "*********************************************************************************"
  echo "******** Crypto material generation completed for channel : $CHANNEL_NAME********"
  echo "*********************************************************************************"
}

function dockerComposeUp {
    for (( i=1; i<=$ORGS; i++ ))
    do    
        PEERS=$(jq ".Organizations[$org].peers" UserInput.json)
        for (( j=0; j<$PEERS; j++ ))
        do
            echo "$(docker-compose -f peer${j}_org${i}.yaml up -d)"
            echo "$(docker-compose -f docker-compose-orderer.yaml up -d)"
        done
    done
}

function networkUp() {
 
  docker-compose -f docker-compose-cli.yaml up -d
    # now run the end to end script
  docker exec cli scripts/script.sh $CHANNEL_NAME $ORGS $CHANNEL
  if [ $? -ne 0 ]; then
    echo "ERROR !!!! Test failed"
    exit 1
  fi
}

function clearContainers() {
  CONTAINER_IDS=$(docker ps -a | awk '($2 ~ /dev-peer.*.mycc.*/) {print $1}')
  if [ -z "$CONTAINER_IDS" -o "$CONTAINER_IDS" == " " ]; then
    echo "---- No containers available for deletion ----"
  else
    docker rm -f $CONTAINER_IDS
  fi
}

function removeUnwantedImages() {
  DOCKER_IMAGE_IDS=$(docker images | awk '($1 ~ /dev-peer.*.mycc.*/) {print $3}')
  if [ -z "$DOCKER_IMAGE_IDS" -o "$DOCKER_IMAGE_IDS" == " " ]; then
    echo "---- No images available for deletion ----"
  else
    docker rmi -f $DOCKER_IMAGE_IDS
  fi
}

function networkDown() {
  # stop org3 containers also in addition to org1 and org2, in case we were running sample to add org3
  # stop kafka and zookeeper containers in case we're running with kafka consensus-type
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


case $MODE in 
    (up)
        networkUp
        exit 0
        ;;
    (gen)
        generateChannelArtifacts
        exit 0
        ;;
    (down)
        networkDown
        exit 0
        ;;
esac