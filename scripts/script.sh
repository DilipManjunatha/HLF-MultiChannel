#!/bin/bash

echo "Started end-to-end test"
echo
CHANNEL_NAME="$1"
ORGS="$2"
CHANNEL="$3"

COUNTER=1
MAX_RETRY=10
LANGUAGE="golang"
TIMEOUT="10"
DELAY="3"
VERBOSE="false"

CC_SRC_PATH="github.com/chaincode/chaincode_example02/go/"

echo "Channel name : "$CHANNEL_NAME

PEER0_ORG1_PORT=$(jq ".AllOrgs[0].peerPorts[0]" scripts/UserInput.json)
PEER0_ORG2_PORT=$(jq ".AllOrgs[1].peerPorts[0]" scripts/UserInput.json)

# import utils
. scripts/utils.sh

createChannel() {
		
		ORG_NAME=$(jq ".Channels[$CHANNEL].Organizations[0].name" scripts/UserInput.json | tr -d '"')
		setGlobals 0 $ORG_NAME
		set -x
		peer channel create -o orderer.example.com:7050 -c $CHANNEL_NAME -f ./channel-artifacts/$CHANNEL_NAME.tx --tls --cafile $ORDERER_CA >&log.txt
		res=$?
		set +x
		cat log.txt
		verifyResult $res "Channel creation failed"
		echo "===================== Channel '$CHANNEL_NAME' created ===================== "
		echo
	
}

joinChannel () {
	for ((org=0; org<$ORGS; org++))
	do
		ORG_NAME=$(jq ".Channels[$CHANNEL].Organizations[$org].name" scripts/UserInput.json | tr -d '"')
		PEERS=$(jq ".Channels[$CHANNEL].Organizations[$org].peers" scripts/UserInput.json)
			
	    for ((peer=0 ; peer<$PEERS; peer++)) do
			PPORT=$(jq ".Channels[$CHANNEL].Organizations[$org].peerPorts[$peer]" scripts/UserInput.json)
			joinChannelWithRetry $peer $ORG_NAME $PPORT
			echo "===================== peer${peer}.$ORG_NAME joined channel '$CHANNEL_NAME' ===================== "
			sleep $DELAY
			echo
	    done
	done
}

anchorPeersUpdate() {
	for ((org=0 ; org<$ORGS; org++))
	do
		ORG_NAME=$(jq ".Channels[$CHANNEL].Organizations[$org].name" scripts/UserInput.json | tr -d '"')
		ANCHOR_PEER_PORT=$(jq ".Channels[$CHANNEL].Organizations[$org].AnchorPeers[0].Port" scripts/UserInput.json)
		updateAnchorPeers 0 $ORG_NAME $ANCHOR_PEER_PORT
	done
}

installTheChaincode() {

		for ((org=0 ; org<$ORGS; org++)) do
			PEERS=$(jq ".Channels[$CHANNEL].Organizations[$org].peers" scripts/UserInput.json)
			ORG_NAME=$(jq ".Channels[$CHANNEL].Organizations[$org].name" scripts/UserInput.json | tr -d '"')
			for ((peer=0; peer<$PEERS; peer++)) do
				PPORT=$(jq ".Channels[$CHANNEL].Organizations[$org].peerPorts[$peer]" scripts/UserInput.json)				
				echo "Installing chaincode on peer${peer}.${ORG_NAME}..."
				installChaincode $peer $ORG_NAME $PPORT
			done
		done
				
}

instantiateTheChaincode() {
			PEER=0;
			ORG_NAME=$(jq ".Channels[$CHANNEL].Organizations[0].name" scripts/UserInput.json | tr -d '"')
			PPORT=$(jq ".Channels[$CHANNEL].Organizations[0].peerPorts[0]" scripts/UserInput.json)
			echo "Instantiating chaincode on peer${peer}.${ORG_NAME}..."
			instantiateChaincode $PEER $ORG_NAME $PPORT
			
}

## Create channel
echo "Creating channel..."
createChannel

# # ## Join all the peers to the channel
echo "Having all peers join the channel..."
joinChannel

echo "################ All the peers joined the channel $CHANNEL_NAME ###############"
echo
echo "Updating the anchor peers...."
# Set the anchor peers for each org in the channel. Default peer is set to peer0. 
anchorPeersUpdate

# # Install chaincode on all peers
installTheChaincode

echo "Instantiating chaincode...."
instantiateTheChaincode

echo
echo "========= All GOOD FOR CHANNEL $CHANNEL_NAME =========== "
echo

exit 0
