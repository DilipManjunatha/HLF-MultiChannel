const yaml = require('js-yaml');
const fs = require('fs');
const inputJson = require('./UserInput2.json')
const configJson = require('./configtx-template2.json')
const cryptoJson = require("./crypto-template.json")
const channelCount = inputJson.Channels.length;
const channels = inputJson.Channels;
const allOrgs = inputJson.AllOrgs;

function cryptoConfig() {

    data = {
        'OrdererOrgs': [{
            'Name': 'Orderer',
            'Domain': 'example.com',
            'Specs': [{ 'Hostname': 'orderer' }]
        }],

        'PeerOrgs': []
    };

    for (i in inputOrgs) {
        var x = parseInt(i) + 1;
        var peers = inputOrgs[i].peers
        data.PeerOrgs.push({
            'Name': 'Org' + (x),
            'Domain': 'org' + (x) + '.example.com',
            'EnableNodeOUs': true,
            'Template': { 'Count': peers },
            'Users': { 'Count': 1 }
        })
    }

    fs.writeFileSync('./crypto-config.yaml', yaml.dump(data));
}

function cryptoConfigv2() {
    var peerOrgStr = JSON.stringify(cryptoJson.PeerOrgs);
    var data = cryptoJson;
    delete data.PeerOrgs;
    data.PeerOrgs = [];

    for (let i in allOrgs) {
        var inputOrgs = allOrgs[i];
        var orgName = inputOrgs.name;
        var peers = parseInt(inputOrgs.peers);
        replacedStr = JSON.parse(replaceTempStr(peerOrgStr, ['{Org}', '{peers}'], [orgName, peers]));
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

function configtxv1(orgs) {

    var ordererOrg = {
        Name: 'OrdererOrg',
        ID: 'OrdererMSP',
        MSPDir: './crypto-config/ordererOrganizations/example.com/msp'
    }

    var ordererDefault = {
        'Addresses': ['orderer.example.com:7050'],
        'BatchSize': {
            'AbsoluteMaxBytes': '99 MB',
            'MaxMessageCount': 10,
            'PreferredMaxBytes': '512 KB'
        },
        'BatchTimeout': '2s',
        'OrdererType': 'solo',
        'Organizations': null
    }

    var data = {

        'Organizations': [ordererOrg],

        'Orderer': ordererDefault,

        'Profiles': {
            'FirstOrdererGenesis': {
                'Orderer': {
                    'Organizations': [ordererOrg],
                    'Addresses': ['orderer.example.com:7050'],
                    'BatchSize': {
                        'AbsoluteMaxBytes': '99 MB',
                        'MaxMessageCount': 10,
                        'PreferredMaxBytes': '512 KB'
                    },
                    'BatchTimeout': '2s',
                    'OrdererType': 'solo',
                },
                'Consortiums': { 'SampleConsortium': { 'Organizations': [] } }
            },

            'Autochannel': { 'Consortium': 'SampleConsortium', 'Application': { 'Organizations': [] } },
        },

        'Application': { 'Organizations': null },

    }

    for (i = 0; i < orgs; i++) {

        let orglist = {
            'ID': 'Org' + (i + 1) + 'MSP',
            'MSPDir': './crypto-config/peerOrganizations/' + (i + 1) + '.example.com/msp',
            'Name': 'Org' + (i + 1) + 'MSP'
        }

        data.Organizations.push(orglist)
        data.Profiles.FirstOrdererGenesis.Consortiums.SampleConsortium.Organizations.push(orglist)
        data.Profiles.Autochannel.Application.Organizations.push(orglist)
    }

    fs.writeFileSync('./configtx.yaml', yaml.dump(data));
}

function configtxv2(orgs) {
    var data = configJson;
    for (i = 0; i < orgs; i++) {
        let orglist = {
            'ID': 'Org' + (i + 1) + 'MSP',
            'MSPDir': './crypto-config/peerOrganizations/' + (i + 1) + '.example.com/msp',
            'Name': 'Org' + (i + 1) + 'MSP'
        }

        data.Organizations.push(orglist)
        data.Profiles.FirstOrdererGenesis.Consortiums.SampleConsortium.Organizations.push(orglist)
        data.Profiles.Autochannel.Application.Organizations.push(orglist)
    }
    fs.writeFileSync('./configtx.yaml', yaml.dump(data));
}

function configtxv3() {
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

function configtxv4() {
    function configtxv3() {
        var data = configJson;

        for (let i in channels) {
            var inputChannels = channels[i];
            var profileName = inputChannels.ChannelName + "Profile";
            var channelOrgs = inputChannels.Organizations;
            

            for (let i in channelOrgs) {
                var orgName = channelOrgs[i].name;
                let orglist = {
                    'ID': orgName + 'MSP',
                    'MSPDir': './crypto-config/peerOrganizations/' + (orgName) + '.com/msp',
                    'Name': orgName + 'MSP'
                };
                data.Profiles[profileName].Application.Organizations.push(orglist);
            }
        }
        for (let i in allOrgs) {
            var orgName = allOrgs[i].name;
            let orglist = {
                'ID': orgName + 'MSP',
                'MSPDir': './crypto-config/peerOrganizations/' + orgName + '.com/msp',
                'Name': orgName + 'MSP'
            };
            data.Organizations.push(orglist)
            data.Profiles.FirstOrdererGenesis.Consortiums.SampleConsortium.Organizations.push(orglist);
        }
        fs.writeFileSync('./configtx.yaml', yaml.dump(data));
    }
}

// function allOrgs(data, res) {
//     for (let i in res) {
//         let orglist = {
//             'ID': res[i] + 'MSP',
//             'MSPDir': './crypto-config/peerOrganizations/' + (res[i]) + '.com/msp',
//             'Name': res[i] + 'MSP'
//         };

//         data.Organizations.push(orglist)
//         data.Profiles.FirstOrdererGenesis.Consortiums.SampleConsortium.Organizations.push(orglist);
//     }
// }
function replaceTempStr(str, findArray, replaceArray) {
    var i, regex = [], map = {};
    for (i = 0; i < findArray.length; i++) {
        regex.push(findArray[i].replace(/([-[\]{}()*+?.\\^$|#,])/g, '\\$1'));
        map[findArray[i]] = replaceArray[i];
    }
    regex = regex.join('|');
    str = str.replace(new RegExp(regex, 'g'), function (matched) {
        return map[matched];
    });
    return str;
}

// cryptoConfig()
cryptoConfigv2()
// configtxv1(orgs)
// configtxv2(orgs)
configtxv3()
// allOrgs()
