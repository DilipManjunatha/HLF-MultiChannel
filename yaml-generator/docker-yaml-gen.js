const yaml = require('js-yaml');
const fs = require('fs');
const rep = require("../utilities/replaceString.js")
const dockerbase = require("../json-templates/dockerbase-template.json");
const inputJson = require('../UserInput.json');
const compose = require("../json-templates/docker-compose-cli-template.json");
const exec = require('child_process');

const allOrgs = inputJson.AllOrgs;
const inputChannel = inputJson.SystemChannel;


function createDockerBaseYaml() {
    var peerConfig = dockerbase["services"]["peer{PEER}.{OrgName}.com"]
    var peerStr = JSON.stringify(peerConfig)
    var resultbase = dockerbase
    delete resultbase["services"]["peer{PEER}.{OrgName}.com"]

    for (i in allOrgs) {
        var orgName = allOrgs[i].name;
        var peers = allOrgs[i].peers;
        var peerPorts = allOrgs[i].peerPorts;
        var gossipPeer = allOrgs[i].gossipPeer;
        for (j = 0; j < peers; j++) {
            resultbase["services"]["peer" + (j) + "." + orgName + ".com"] = JSON.parse(rep.replaceTempStr(peerStr, ['{OrgName}', '{PEER}', '{PEER_PORT}', '{CCPORT}', '{gossipPeer}',], [orgName, j, peerPorts[j], (peerPorts[j] + 1), (gossipPeer[j])]));
        }
    }

    fs.writeFileSync('./base/docker-compose-base.yaml', yaml.dump(resultbase), (err) => {
        if (err) { console.error('docker-compose-base.yaml file is not created ' + err) }
        else { console.log('docker-compose-base.yaml file is created'); }
    });
}

function createComposeCliYaml() {

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

        for (j = 0; j < peers; j++) {
            resultbase["services"]["peer" + (j) + "." + orgName + ".com"] = JSON.parse(rep.replaceTempStr(peerStr, ['{OrgName}', '{PEER}', '{PEER_PORT}', '{CCPORT}'], [orgName, j, peerPorts[j], (peerPorts[j] + 1)]));
            resultbase["services"]["ca-" + orgName] = JSON.parse(rep.replaceTempStr(caStr, ['{OrgName}', '{PEER}', '{CAPORT}'], [orgName, j, caPort]));
            resultbase.services.cli.depends_on.push("peer" + (j) + "." + orgName + ".com");
            resultbase.volumes["peer" + (j) + "." + orgName + ".com"] = null
        }

    }

    var res = resultbase;
    var cliConfig = res["services"]["cli"];
    var cliStr = JSON.stringify(cliConfig);

    delete res["services"]["cli"]
    res["services"]["cli"] = JSON.parse(rep.replaceTempStr(cliStr, ['{DefaultCliOrg}', '{PEER}', '{SYSCHANNEL}', '{DefaultPeerPort}'], [allOrgs[0].name, 0, sysChannel, allOrgs[0].peerPorts[0]]));

    
        fs.writeFileSync('./docker-compose-cli.yaml', yaml.dump(res)), (err) => {
            if (err) { console.error('docker-compose-cli.yaml file is not created ' + err) }
            else { console.log('docker-compose-cli.yaml file is created'); }
        };
    
    // Call shell script to replace private keys of the CAs
    for (i in allOrgs) {
        var orgName = allOrgs[i].name;
        exec.execSync('cd ../' + '\n' + 'sh ./utilities/replacePvtKey.sh ' + orgName, (err) => {
            if (err) { console.log("Unable to replace private key", err); }
            else { console.log("Added private key to docker yaml files"); }
        });
    }
}


createComposeCliYaml()
createDockerBaseYaml()
