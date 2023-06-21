'use strict';

const fs = require('fs');
const path = require('path');
const { Wallets, Gateway } = require('fabric-network');

const testNetworkRoot = path.resolve(require('os').homedir(), 'fabric-samples/test-network');


async function addToWallet() {

    try {
        const wallet = await Wallets.newFileSystemWallet('./wallet');
        
        const predefinedOrgs = [
            {
                name: 'org1.example.com',
                mspId: 'Org1MSP',
                users: ['Admin', 'User1']
            }, {
                name: 'org2.example.com',
                mspId: 'Org2MSP',
                users: ['Admin', 'User1']
            }
        ];

        for (const org of predefinedOrgs) {
            const credPath = path.join(testNetworkRoot, '/organizations/peerOrganizations/', org.name, '/users');
            
            for (const user of org.users) {
                const mspFolderPath = path.join(credPath, `${user}@${org.name}`, '/msp');
                
                // expecting only one cert file and one key file to be in the directories
                const certFile = path.join(mspFolderPath, '/signcerts/', fs.readdirSync(path.join(mspFolderPath, '/signcerts'))[0]);
                const keyFile = path.join(mspFolderPath, '/keystore/', fs.readdirSync(path.join(mspFolderPath, '/keystore'))[0]);

                const cert = fs.readFileSync(certFile).toString();
                const key = fs.readFileSync(keyFile).toString();

                const identity = {
                    credentials: {
                        certificate: cert,
                        privateKey: key,
                    },
                    mspId: org.mspId,
                    type: 'X.509',
                };

                const identityLabel = `${user}@${org.name}`;
                await wallet.put(identityLabel, identity);
                console.log(`wallet put ${identityLabel}`)
            }
        }
        return wallet
    } catch (error) {
        console.log(`Error adding to wallet. ${error}`);
        console.log(error.stack);
    }
}


async function main() {

    const wallet = await addToWallet()

    const gateway = new Gateway();
    // const wallet = await Wallets.newFileSystemWallet('./wallet');

    try {
        let args = process.argv.slice(2);

        const identityLabel = "User1@org2.example.com";
        const functionName = "currencyList";

        const orgName = identityLabel.split('@')[1];
        const orgNameWithoutDomain = orgName.split('.')[0];

        let connectionProfile = JSON.parse(fs.readFileSync(
            path.join(testNetworkRoot, 
                'organizations/peerOrganizations', 
                orgName, 
                `/connection-${orgNameWithoutDomain}.json`), 'utf8')
        );

        let connectionOptions = {
            identity: identityLabel,
            wallet: wallet,
            discovery: {enabled: true, asLocalhost: true}
        };

        console.log('Connect to a Hyperledger Fabric gateway.');
        await gateway.connect(connectionProfile, connectionOptions);

        console.log('Use channel "mychannel".');
        const network = await gateway.getNetwork('mychannel');

        console.log('Use BalanceTransfer.');
        const contract = network.getContract('balance_transfer');

        console.log('Submit ' + functionName + ' transaction.');
        const response = await contract.submitTransaction(functionName);
        if (`${response}` !== '') {
            console.log(`Response from ${functionName}: ${response}`);
        }

    } catch (error) {
        console.log(`Error processing transaction. ${error}`);
        console.log(error.stack);
    } finally {
        console.log('Disconnect from the gateway.');
        gateway.disconnect();
    }
}

main();