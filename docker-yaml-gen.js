
const yaml = require('js-yaml');
const fs   = require('fs');
const dockerbase = require("./dockerbase.json");
const inputJson = require('./UserInput2.json');
const compose = require("./compose.json");
const exec = require('child_process');

const allOrgs = inputJson.AllOrgs;
const inputChannel = inputJson.SystemChannel;
const orgs = allOrgs.length;


// Version-3 of docker compose base file creation. It uses UserInput.json file.
function createDockerBasev3(){
    var peerConfig = dockerbase["services"]["peer{PEER}.{OrgName}.com"]
    var peerStr = JSON.stringify(peerConfig)
    var resultbase = dockerbase
    delete resultbase["services"]["peer{PEER}.{OrgName}.com"] 

    for (i in allOrgs) {
        var orgName = allOrgs[i].name;
        var peers = allOrgs[i].peers;
        var peerPorts = allOrgs[i].peerPorts;
        var gossipPeer = allOrgs[i].gossipPeer;
        for (j=0; j<peers; j++) {
            resultbase["services"]["peer"+(j)+"."+orgName+".com"] = JSON.parse(replaceTempStr(peerStr, ['{OrgName}','{PEER}','{PEER_PORT}','{CCPORT}','{gossipPeer}',], [orgName,j,peerPorts[j],(peerPorts[j]+1),(gossipPeer[j])]));
        }
    }
    try{
        fs.writeFileSync('./base/docker-compose-base.yaml',yaml.dump(resultbase));
    }
    catch(error){
        console.error('Oops!! Following error occured: ' + error)
    }
}

function createComposeCliFile(){
    
    var peerConfig = compose["services"]["peer{PEER}.{OrgName}.com"];
    var caConfig = compose["services"]["ca-{OrgName}"];
    var peerStr = JSON.stringify(peerConfig);
    var caStr = JSON.stringify(caConfig);

    var resultbase = compose; // Local copy of the json to replace the template strings
    delete resultbase["services"]["peer{PEER}.{OrgName}.com"];
    delete resultbase["services"]["ca-{OrgName}"];

    for (i in allOrgs) {
        var orgName = allOrgs[i].name;
        var peers = allOrgs[i].peers;
        var peerPorts = allOrgs[i].peerPorts;
        var caPort = allOrgs[i].caPort;
        var sysChannel = inputChannel

        for (j=0; j<peers; j++) {
            resultbase["services"]["peer"+(j)+"."+orgName+".com"] = JSON.parse(replaceTempStr(peerStr, ['{OrgName}','{PEER}','{PEER_PORT}','{CCPORT}'], [orgName,j,peerPorts[j],(peerPorts[j]+1)]));
            resultbase["services"]["ca-"+orgName] = JSON.parse(replaceTempStr(caStr, ['{OrgName}','{PEER}','{CAPORT}'], [orgName,j,caPort])); 
            resultbase.services.cli.depends_on.push("peer"+(j)+"."+orgName+".com");
            resultbase.volumes["peer"+(j)+"."+orgName+".com"] = null
        }
            
        }
    
    var res = resultbase;
    var cliConfig = res["services"]["cli"];
    var cliStr = JSON.stringify(cliConfig);

    delete res["services"]["cli"]
    res["services"]["cli"] = JSON.parse(replaceTempStr(cliStr, ['{DefaultCliOrg}','{PEER}','{SYSCHANNEL}','{DefaultPeerPort}'], [allOrgs[0].name,0,sysChannel,allOrgs[0].peerPorts[0]]));

    
    fs.writeFileSync('./docker-compose-cli.yaml',yaml.dump(res));
    console.log('docker-compose-cli.yaml file is created');

    // Call shell script to replace private keys of the CA
    for (i in allOrgs) {
        var orgName = allOrgs[i].name;
        exec.execSync('sh ./replacePvtKey.sh ' + orgName);
    }

    
}


function cryptoConfig(){
data = {'OrdererOrgs': [{'Name': 'Orderer',
                            'Domain': 'example.com',
                            'Specs': [{'Hostname': 'orderer'}]}],
            
            'PeerOrgs': []
            };

// for (i=1; i<=orgs; i++){
//     data.PeerOrgs.push({'Name': 'Org'+(i),
//         'Domain': 'org'+(i)+'.com',
//         'EnableNodeOUs': true,
//         'Template': {'Count': peers},
//         'Users': {'Count': 1} })
// }

for (i in allOrgs) {
    var x =  parseInt(i) + 1;
    var peers = allOrgs[i].peers
    data.PeerOrgs.push({'Name': 'Org'+(x),
        'Domain': 'org'+(x)+'.com',
        'EnableNodeOUs': true,
        'Template': {'Count': peers},
        'Users': {'Count': 1} })
}

fs.writeFileSync('./crypto-config.yaml',yaml.dump(data));
}


function configtx(orgs){

    
    var ordererOrg = {  Name: 'OrdererOrg',
                    ID: 'OrdererMSP',
                    MSPDir: './crypto-config/ordererOrganizations/example.com/msp' }

    var ordererDefault={'Addresses': ['orderer.example.com:7050'],
                    'BatchSize': {'AbsoluteMaxBytes': '99 MB',
                                'MaxMessageCount': 10,
                                'PreferredMaxBytes': '512 KB'},
                    'BatchTimeout': '2s',
                    'Kafka': {'Brokers': ['127.0.0.1:9092']},
                    'OrdererType': 'solo',
                    'Organizations': null}

    
 var data = {
        
            'Organizations': [ordererOrg],
    
            'Orderer': ordererDefault,
            
            'Profiles': {
                        'FirstOrdererGenesis':{
                            'Orderer':{
                                'Organizations':[ordererOrg],
                                'Addresses': ['orderer.example.com:7050'],
                                'BatchSize': {'AbsoluteMaxBytes': '99 MB',
                                            'MaxMessageCount': 10,
                                            'PreferredMaxBytes': '512 KB'},
                                'BatchTimeout': '2s',
                                'Kafka': {'Brokers': ['127.0.0.1:9092']},
                                'OrdererType': 'solo',
                            },
                            'Consortiums':{'SampleConsortium':{'Organizations':[]}}},
    
                        'Autochannel':{'Consortium': 'SampleConsortium','Application':{'Organizations':[]}},
                        },
    
            'Application': {'Organizations': null},
                
        }


    for (i=0; i<orgs; i++){

        let orglist = { 'ID': 'Org'+(i+1)+'MSP',
                        'MSPDir': './crypto-config/peerOrganizations/org'+(i+1)+'.com/msp',
                        'Name': 'Org'+(i+1)+'MSP'}

        data.Organizations.push(orglist)
        data.Profiles.FirstOrdererGenesis.Consortiums.SampleConsortium.Organizations.push(orglist)
        data.Profiles.Autochannel.Application.Organizations.push(orglist)   
        }
    
    console.log(data)

    fs.writeFileSync('./configtx.yaml',yaml.dump(data));
}


/* Version-1 of docker compose base yaml file creation. 
 Dynamic YAML is created with data in js objects locally.*/
function createDockerBasev1(orgs,peers){

    
    data =  {

            version: '2',

            volumes: 
            { 'orderer.example.com': null},
                
            networks: { byfn: null },

            services: {
                        cli:{ 
                            container_name: 'cli',
                            image: 'hyperledger/fabric-tools:$IMAGE_TAG',
                            tty: true,
                            stdin_open: true,
                            environment: 
                            [ 'SYS_CHANNEL=$SYS_CHANNEL',
                            'GOPATH=/opt/gopath',
                            'CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock',
                            'FABRIC_LOGGING_SPEC=INFO',
                            'CORE_PEER_ID=cli',
                            'CORE_PEER_ADDRESS=peer0.org1.com:7051',
                            'CORE_PEER_LOCALMSPID=Org1MSP',
                            'CORE_PEER_TLS_ENABLED=true',
                            'CORE_PEER_TLS_CERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.com/peers/peer0.org1.com/tls/server.crt',
                            'CORE_PEER_TLS_KEY_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.com/peers/peer0.org1.com/tls/server.key',
                            'CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.com/peers/peer0.org1.com/tls/ca.crt',
                            'CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.com/users/Admin@org1.com/msp' ],
                            working_dir: '/opt/gopath/src/github.com/hyperledger/fabric/peer',
                            command: '/bin/bash',
                            volumes: 
                            [ '/var/run/:/host/var/run/',
                            './../chaincode/:/opt/gopath/src/github.com/chaincode',
                            './crypto-config:/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/',
                            './scripts:/opt/gopath/src/github.com/hyperledger/fabric/peer/scripts/',
                            './channel-artifacts:/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts' ],
                            depends_on: [ 'orderer.example.com' ],
                            networks: [ 'byfn' ] },

                        'orderer.example.com': 
                            { extends: 
                                { file: 'base/docker-compose-base.yaml',
                                service: 'orderer.example.com' },
                            container_name: 'orderer.example.com',
                            networks: [ 'byfn' ] },
        
        }
    }

    for (i=0; i<orgs; i++){
        
        let x = i+1;
        // this["ca"+x] = "ca"+x;
        // let ca = "ca"+x;
        
        var port = ['7060:7060', '7054:7054'];
        
        data["services"]["ca"+x] = {
                                    image: 'hyperledger/fabric-ca:$IMAGE_TAG',
                                    environment:[
                                                'FABRIC_CA_HOME=/etc/hyperledger/fabric-ca-server',
                                                'FABRIC_CA_SERVER_CA_NAME=ca-org'+x,
                                                'FABRIC_CA_SERVER_TLS_ENABLED=true',
                                                'FABRIC_CA_SERVER_TLS_CERTFILE=/etc/hyperledger/fabric-ca-server-config/ca.org'+x+'.example.com-cert.pem',
                                                'FABRIC_CA_SERVER_TLS_KEYFILE=/etc/hyperledger/fabric-ca-server-config/CA'+x+'_PRIVATE_KEY',
                                                'FABRIC_CApeer1_SERVER_PORT=7054' ],
                                    ports: [ port[i] ],
                                    command: 'sh -c \'fabric-ca-server start --ca.certfile /etc/hyperledger/fabric-ca-server-config/ca.org'+x+'.example.com-cert.pem --ca.keyfile /etc/hyperledger/fabric-ca-server-config/CA'+x+'_PRIVATE_KEY -b admin:adminpw -d\'',
                                    volumes: [ './crypto-config/peerOrganizations/org'+x+'.example.com/ca/:/etc/hyperledger/fabric-ca-server-config' ],
                                    container_name: 'ca_peerOrg'+x,
                                    networks: [ 'byfn' ] 
        };
        
        for (j=0; j<peers; j++){
            let y = j+1;
            let p = "peer"+j+".org"+(x)+".example.com";

            data["services"][p] = { 
                                    container_name: p,
                                    extends:{ 
                                        file: 'base/docker-compose-base.yaml',
                                        service: p 
                                    },
                                    networks: [ 'byfn' ] 
            }; 

            data.volumes[p] = null
            data.services.cli.depends_on.push(p);    
            }
    }

    try{ 
        fs.writeFileSync('./docker-compose-auto.yaml',yaml.dump(data));
    }
    catch(error){
        console.error('Oops!! Following error occured: ' + error)
    }
}

/* Version-2 of docker compose base yaml file creation. 
 It uses external JSON template file and creates YAML file. */
function createDockerBasev2(orgs,peers){
    
  var peerConfig = dockerbase["services"]["peer{PEER}.{OrgName}.example.com"]
  var peerStr = JSON.stringify(peerConfig)
  var resultbase = dockerbase 
  delete resultbase["services"]["peer{PEER}.{OrgName}.example.com"]  // copy of json object without the template strings
  

  for(i=1; i<=orgs; i++){
    for(j=0; j<peers; j++){
      resultbase["services"]["peer"+j+".org"+i+ ".example.com"] = JSON.parse(replaceTempStr(peerStr, ['{OrgName}','{PEER}',], [i,j]))
    }
  }

  try{
    writeToFile(resultbase)
  }
  catch(error){
        console.error('Oops!! Following error occured: ' + error)
  }

}

// Replace multiple strings in a given string. Replaces the template strings in template file with repective data
function replaceTempStr( str, findArray, replaceArray ){
    var i, regex = [], map = {}; 
    for( i=0; i<findArray.length; i++ ){ 
      regex.push( findArray[i].replace(/([-[\]{}()*+?.\\^$|#,])/g,'\\$1') );
      map[findArray[i]] = replaceArray[i]; 
    }
    regex = regex.join('|');
    str = str.replace( new RegExp( regex, 'g' ), function(matched){
      return map[matched];
    });
    return str;
  }


function writeToFile(result) {
    fs.writeFileSync('./base/docker-compose-base.yaml',yaml.dump(result));
}

// createDockerBase(2,2)
// createDockerCompose(2,2)
// cryptoConfig()
// configtx(2)
createComposeCliFile()
createDockerBasev3()
