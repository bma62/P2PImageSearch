// Import modules
const net = require('net'),
    path = require('path'),
    yargs = require('yargs'),
    helpers = require('./helpers'),
    singleton = require('./Singleton'),
    handler = require('./ClientsHandler');

// Declare constants
const defaultOption = 'Peer info not provided.',
    host = '127.0.0.1',
    // Get this peer's info from the current folder's name
    peerID = path.basename(process.cwd()).split('-')[0],
    // TODO: change this back to read directory
    peerTableSize = 2;
// peerTableSize = Number(path.basename(process.cwd()).split('-')[1]);

// Set up command line options
const argv = yargs
    .usage('Usage: $0 -p [Peer IP:Port] -v [Version]')
    .options({
        'p': {
            demandOption: true,
            default: defaultOption,
            type: 'string',
            describe: 'The initial peer IP and port to connect to.',
        },
        'v': {
            demandOption: true,
            default: 7,
            type: 'number',
            describe: 'The PTP protocol version.',
        }
    })
    .argv;
const version = argv.v;

net.bytesWritten = 300000;
net.bytesRead = 300000;
net.bufferSize = 300000;

// Create a imageDB instance, and chain the listen function to it
const imageDB = net.createServer();
imageDB.listen(0, host, () => {
    singleton.init(version, peerID, peerTableSize, host, imageDB.address().port);
    console.log('ImageDB server is started at timestamp: ' + singleton.getTimestamp() + ' and is listening on ' + host + ':' + imageDB.address().port);
})
// **** Image Socket ****
imageDB.on('connection', function (sock) {
    handler.handleClientJoining(sock); //called for each client joining
});

// Check if -p option is provided
if (argv.p !== defaultOption) {
    startPTPClient(argv.p);
}
// If the -p option is not provided, start server right away
else {
    // Use 0 for port to let OS assign an unused port
    // **** Peer Port ****
    startPTPServer(0, host, peerID);
}

// **** CLIENT-SIDE CODE ****
function startPTPClient(peerOption) {

    // Read command line inputs in
    const peerAddress = peerOption.split(':')[0],
        peerPort = Number(peerOption.split(':')[1]);

    // Create socket
    let client = new net.Socket();
    let peerPacket = Buffer.alloc(0), redirect, peerAddressTable = [], peerPortTable = [], redirectCounter = 0,
        declinedPeerTable = []; // Added table to track peers that declined connection

    // Connect to the designated peer and port
    client.connect(peerPort, peerAddress);

    // Handle PTP packet received from the peer
    client.on('data', (data) => {

        // Concatenate received data in case the packet is divided into multiple chunks
        peerPacket = Buffer.concat([peerPacket, data]);

        // Check the delimiter for complete packet
        if (peerPacket.slice(-1).toString() === '\n') {

            // console.log('full packet received');
            // Remove the delimiter
            peerPacket = peerPacket.slice(0, -1);

            // Decode the packet and retrieve peer table received from the peer if any
            const peerResults = decodePacket(peerPacket, client.remoteAddress, client.remotePort, client);
            redirect = peerResults.redirect;

            // If connection to peer is redirected, append that peer's full peer table for redirection later
            if (redirect) {
                peerAddressTable = peerAddressTable.concat(peerResults.peerAddressTable);
                peerPortTable = peerPortTable.concat(peerResults.peerPortTable);
            }

            // If redirect is false and the decoded peer table is null, then the version/messageType is not recognized, so exit
            if (!redirect && peerResults.peerAddressTable === null) {
                console.log(`Unrecognized PTP version or message type from ${peerAddress}:${peerPort}; the program will exit...`);
                process.exit();
            }
            // If redirect is false but the peer table is not null, then connection is successful - start the server side functionality
            else if (!redirect) {
                // Get OS assigned port to start server
                const assignedPort = client.localPort;
                // **** Peer Port ****
                startPTPServer(assignedPort, host, peerID);
            }
            // If redirect is true, but the peer table is empty or we have reached the bottom of the table - exit the program
            else if (redirect && (peerAddressTable.length === 0 || redirectCounter === peerAddressTable.length)) {
                redirect = false;
                console.log(`No joinable peer; the program will exit...`);
                process.exit();
            }
            // Record the peer declined and try to go down the peer table to redirect to another peer
            else {
                declinedPeerTable.push(`${client.remoteAddress}:${client.remotePort}`);
                redirect = true;
            }
        }
    });

    // Socket fully closed because redirecting has to be performed or a peer left
    client.on('close', () => {
        // No need to redirect if a peer just left
        if (redirect) {
            peerPacket = Buffer.alloc(0); // Clear the buffer used for previous packet

            // Check if the peer to re-connect has declined connection before, if yes - skip it
            while (declinedPeerTable.includes(`${peerAddressTable[redirectCounter]}:${peerPortTable[redirectCounter]}`)) {
                ++redirectCounter;
                // If we have reached the bottom of the table - exit the program
                if (redirectCounter === peerAddressTable.length) {
                    console.log(`No joinable peer; the program will exit...`);
                    process.exit();
                }
            }

            client.connect(peerPortTable[redirectCounter], peerAddressTable[redirectCounter], () => {
                ++redirectCounter;
                redirect = false;
            });
        }
    });

    // If a peer has left, try connecting to that peer's address will cause an error - no need to handle, just exit
    client.on('error', (err) => {
        console.log(`Connection to a peer already left - ${err}; the program will exit...\n`);
        process.exit();
    });
}

// **** SERVER-SIDE FUNCTIONALITY ****
function startPTPServer(serverPort, serverHost, peerID) {

    const peerServer = net.createServer();

    peerServer.listen(serverPort, serverHost, () => {
        console.log(`This peer address is ${peerServer.address().address}:${peerServer.address().port} located at ${peerID}\n`);
    });

    peerServer.on('connection', sock => {
        handler.handlePeerJoining(sock); //called for each client joining
    });
}

// Decode PTP packet
function decodePacket(packet, senderAddress, senderPort, sock) {

    // Read first 4 bytes of the header, convert to binary string, and pad to 32-bit length
    let bufferOffset = 0;
    const header = helpers.padStringToLength(helpers.int2bin(packet.readUInt32BE(bufferOffset)), 32);
    bufferOffset = bufferOffset + 4;

    // First 3 bits is the version, if it's not 7 - the packet should be ignored
    const version = helpers.bin2int(header.substring(0, 3));
    if (version !== 7) {
        return {
            redirect: false,
            peerAddressTable: null,
            peerPortTable: null
        };
    }

    const messageType = helpers.bin2int(header.substring(3, 11)),
        numberOfPeers = helpers.bin2int(header.substring(11, 24)),
        senderIDLength = helpers.bin2int(header.substring(24)),
        senderID = packet.slice(bufferOffset, bufferOffset + senderIDLength).toString();
    bufferOffset = bufferOffset + senderIDLength;

    // Decode the peer table received
    let peerAddressTable = [], peerPortTable = [];
    for (let i = 0; i < numberOfPeers; i++) {

        // Convert 32-bit IP string to proper format
        let IPString = helpers.padStringToLength(helpers.int2bin(packet.readUInt32BE(bufferOffset)), 32);
        bufferOffset = bufferOffset + 4;

        IPString = helpers.bin2int(IPString.substring(0, 8)) + '.' +
            helpers.bin2int(IPString.substring(8, 16)) + '.' +
            helpers.bin2int(IPString.substring(16, 24)) + '.' +
            helpers.bin2int(IPString.substring(24, 32));
        peerAddressTable.push(IPString);

        peerPortTable.push(packet.readUInt16BE(bufferOffset));
        bufferOffset = bufferOffset + 2;
    }

    switch (messageType) {
        case 1:
            // Message type 1 = connection successful
            console.log(`Connected to peer ${senderID}:${senderPort} at timestamp: ${singleton.getTimestamp()}`);
            console.log(`Received ack from ${senderID}:${senderPort}`);
            singleton.addPeer(senderAddress, senderPort, sock, senderID);
            displayReceivedPeerTable(peerAddressTable, peerPortTable);
            return {
                redirect: false,
                peerAddressTable: peerAddressTable,
                peerPortTable: peerPortTable
            };

        case 2:
            // Message type 2 = redirect
            console.log(`Received ack from ${senderID}:${senderPort}`);
            displayReceivedPeerTable(peerAddressTable, peerPortTable);
            console.log('The join has been declined; the auto-join process is performing...\n');
            return {
                redirect: true,
                peerAddressTable: peerAddressTable,
                peerPortTable: peerPortTable
            };

        default:
            // If message type is not recognized, the packet should be ignored
            return {
                redirect: false,
                peerAddressTable: null,
                peerPortTable: null
            };
    }
}

// Display peering information
function displayReceivedPeerTable(peerAddressTable, peerPortTable) {
    if (peerAddressTable.length > 0) {
        let message = '  which is peered with: ';
        peerAddressTable.forEach((peerAddress, index) => {
            message += `[${peerAddress}:${peerPortTable[index]}]`;
            if (index !== peerAddressTable.length - 1) {
                message += ', ';
            } else {
                message += '\n';
            }
        })
        console.log(message);
    }
}