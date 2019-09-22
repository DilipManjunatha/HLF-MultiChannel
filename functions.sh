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

function dockerComposeUp() {
  docker-compose -f docker-compose-cli.yaml up -d
  # now run the end to end script
  docker exec cli scripts/script.sh $CHANNEL_NAME $ORGS $CHANNEL
  if [ $? -ne 0 ]; then
    echo "ERROR !!!! Test failed"
    exit 1
  fi
}



case $MODE in
up)
  dockerComposeUp
  exit 0
  ;;
generate)
  generateChannelArtifacts
  exit 0
  ;;
restart)
  dockerComposeUp
  exit 0
  ;;  
esac
