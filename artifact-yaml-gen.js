const yaml = require('js-yaml');
const fs = require('fs');
const rep = require("./common.js")
const inputJson = require('./UserInput.json');
const configJson = require('./configtx-template.json');
const cryptoJson = require("./crypto-template.json");
const channels = inputJson.Channels;
const allOrgs = inputJson.AllOrgs;


function createCryptoConfigYaml() {
    var peerOrgStr = JSON.stringify(cryptoJson.PeerOrgs);
    var data = cryptoJson;
    delete data.PeerOrgs;
    data.PeerOrgs = [];

    for (let i in allOrgs) {
        var inputOrgs = allOrgs[i];
        var orgName = inputOrgs.name;
        var peers = parseInt(inputOrgs.peers);
        replacedStr = JSON.parse(rep.replaceTempStr(peerOrgStr, ['{Org}', '{peers}'], [orgName, peers]));
        replacedStr.Template.Count = parseInt(replacedStr.Template.Count)
        data.PeerOrgs.push(replacedStr)
    };
    try {
        fs.writeFileSync('./crypto-config.yaml', yaml.dump(data));
    }
    catch (error) {
        console.error('Oops!! Following error occured: ' + error)
    }
}

function createConfigtxYaml() {
    var data = configJson;

    for (let i in channels) {
        var inputChannels = channels[i];
        var profileName = inputChannels.ChannelName + "Profile";
        var channelOrgs = inputChannels.Organizations;
        data.Profiles[profileName] = { "Consortium": "SampleConsortium", "Application": { "Organizations": [] } } //Creates channel profiles dynamically

        
        for (let i in channelOrgs) {
            var orgName = channelOrgs[i].name;
            var AnchorPeers = channelOrgs[i].AnchorPeers
            // This object creates block of yaml config for organizations specified in channel profile
            let orglist = {
                'Name': orgName + 'MSP',
                'ID': orgName + 'MSP',
                'MSPDir': './crypto-config/peerOrganizations/' + orgName + '.com/msp',
                AnchorPeers
            };
            data.Profiles[profileName].Application.Organizations.push(orglist);
        }
    }
    for (let i in allOrgs) {
        var orgName = allOrgs[i].name;
        AnchorPeers = allOrgs[i].AnchorPeers
        // This object creates block of yaml config for all organizations in the network
        let orglist = {
            'Name': orgName + 'MSP',
            'ID': orgName + 'MSP',
            'MSPDir': './crypto-config/peerOrganizations/' + orgName + '.com/msp',
            AnchorPeers
        };
        data.Organizations.push(orglist)
        data.Profiles.FirstOrdererGenesis.Consortiums.SampleConsortium.Organizations.push(orglist);
    }
    fs.writeFileSync('./configtx.yaml', yaml.dump(data));
}

// cryptoConfig()
createCryptoConfigYaml()
// configtxv1(orgs)
// configtxv2(orgs)
createConfigtxYaml()
// allOrgs()
