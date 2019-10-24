MODE="$1"
ORGS="$2"
CHANNEL_NAME="$3"
PROFILE_NAME="$4"
CHANNEL="$5"
IMAGETAG="latest"


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

# The function will bring up all the docker containers
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
