#!/bin/bash

ORGS=$1

replacePrivateKey() {
  CURRENT_DIR=$PWD
  cd crypto-config/peerOrganizations/${ORGS}.com/ca/
  PRIV_KEY=$(ls *_sk)
  echo $PRIV_KEY
  cd "$CURRENT_DIR"
  sed -i "s/CA${ORGS}_PRIVATE_KEY/${PRIV_KEY}/g" docker-compose-cli.yaml
}

replacePrivateKey