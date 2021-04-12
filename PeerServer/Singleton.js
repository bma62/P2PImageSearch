const net = require('net'),
    PTPSeachPacket = require('./PTPSearch');

// Some properties of this peer node
let timer, sequenceNumber, PTPVersion, searchID, senderID, peerTable, peerIdTable, peerTableSize,
    peerServerId, peerServerSocket, // Info about the peer server this peer initially connected to
    originatingAddress, originatingPort, seenSearches, seenSearchCounter, //Added variables to hold image port info and seen searches
    isServerBusy;

module.exports = {
    init: function (version, peerID, tableSize, imageDBAddress, imageDBPort) {

        // Initialize timer and sequenceNumber with a random number between 1 and 999
        timer = Math.floor((Math.random() * 999) + 1);
        sequenceNumber = Math.floor((Math.random() * 999) + 1);

        // Increment timer every 10ms
        setInterval(incrementTimer, 10);

        PTPVersion = version;
        senderID = peerID;
        peerTable = [];
        peerIdTable = [];
        peerTableSize = tableSize;
        peerServerId = "";
        searchID = 0;
        seenSearches = [];
        seenSearchCounter = 0;
        originatingAddress = imageDBAddress;
        originatingPort = imageDBPort;
        isServerBusy = false;
    },

    //--------------------------
    //getSequenceNumber: return the current sequence number + 1
    //--------------------------
    getSequenceNumber: function () {
        ++sequenceNumber;
        return sequenceNumber;
    },

    //--------------------------
    //getTimestamp: return the current timer value
    //--------------------------
    getTimestamp: function () {
        return timer;
    },

    // Return the PTP version to use in the packet header
    getPTPVersion: function () {
        return PTPVersion;
    },

    // Return the current search ID
    getSearchID: function () {
        ++searchID;
        return searchID;
    },

    // Return the sender ID of this peer
    getSenderID: function () {
        return senderID;
    },

    // Check if the peer table is full
    isPeerTableFull: function () {
        return peerTable.length === peerTableSize;
    },

    // Insert a new peer into the peer table
    addPeer: function (peerAddress, peerPort, socket, senderID) {
        // Record info of the peer server just connected to
        if (peerTable.length === 0 && senderID !== null) {
            peerServerSocket = socket;
            peerServerId = senderID;
        }
        peerTable.push(`${peerAddress}:${peerPort}`);
    },

    // Remove a specific peer from the peer table
    removePeer: function (peerAddress, peerPort) {
        let peerFullAddress = `${peerAddress}:${peerPort}`;
        let index = peerTable.indexOf(peerFullAddress);
        if (index > -1) {
            peerTable.splice(index, 1);
        }
    },

    // Return the peer IP address table
    getPeerAddressTable: function () {
        let peerAddressTable = []
        peerTable.forEach(peerAddress => {
            peerAddressTable.push(peerAddress.split(':')[0])
        })
        return peerAddressTable;
    },

    // Return the peer port table
    getPeerPortTable: function () {
        let peerPortTable = [];
        peerTable.forEach(peerAddress => {
            peerPortTable.push(peerAddress.split(':')[1])
        })
        return peerPortTable;
    },

    // Return the image DB's IP address
    getOriginatingAddress: function () {
        return originatingAddress;
    },

    // Return the image DB's image port
    getOriginatingPort: function () {
        return originatingPort;
    },

    // A function to send a packet to all connected peers
    sendToAllPeers: function (packet) {

        peerTable.forEach( (peerAddress, index) => {

            if (index === 0 && peerServerId !== "") {
                // The socket to peer server can be re-used
                peerServerSocket.write(packet);
            } else {
                let peerClient = new net.Socket();
                peerClient.connect(peerAddress.split(':')[1], peerAddress.split(':')[0], () => {
                    peerClient.write(packet);
                });

            }
            console.log(`Forwarded to peer ${peerAddress}`);
        })
    },

    // A function to send a packet to all connected peers with exception
    sendToAllPeersExceptIndex: function (packet, exceptIndex) {

        peerTable.forEach((peerAddress, index) => {
            if (index !== exceptIndex) {
                if (index === 0 && peerServerId !== "") {
                    // The socket to peer server can be re-used
                    peerServerSocket.write(packet);
                } else {
                    // Create new sockets to send to peer clients
                    let peerClient = new net.Socket();
                    peerClient.connect(peerAddress.split(':')[1], peerAddress.split(':')[0], () => {
                        peerClient.write(packet);
                    });
                }

                console.log(`Forwarded to peer ${peerAddress}`);
            }
        })


    },

    // A function to test if the search has been seen in the past
    hasSeenSearch: function (originatingPeerAddress, originatingPeerPort, searchID) {
        let searchRecord = `${originatingPeerAddress}:${originatingPeerPort}-${searchID}`;
        return seenSearches.includes(searchRecord);
    },

    // A function to add seen search record in a circular way
    addSearchHistory: function (originatingPeerAddress, originatingPeerPort, searchID) {
        let searchRecord = `${originatingPeerAddress}:${originatingPeerPort}-${searchID}`;
        if (seenSearchCounter === peerTableSize) {
            seenSearchCounter = 0;
        }
        seenSearches[seenSearchCounter] = searchRecord;
        ++seenSearchCounter;
    },

    // A function to forward P2P search packet to peers except for the peer the query came from
    forwardP2PSearchPacket: function (originatingPeerIP, originatingPeerPort, senderID,
                                      version, searchID, fileNameArray, fileTypeArray, socket) {
        let fullFileNameArray = [];
        fileNameArray.forEach((fileName, index)=> {
            fullFileNameArray.push(`${fileName}.${fileTypeArray[index]}`);
        })

        // Recreate search packet with updated senderID
        PTPSeachPacket.init(version, 3, searchID, this.getSenderID(), originatingPeerIP, originatingPeerPort, fullFileNameArray);
        let forwardPacket = PTPSeachPacket.getPacket();
        let delimiter = Buffer.from('\n');
        forwardPacket = Buffer.concat([forwardPacket, delimiter]);

        if (senderID === peerServerId) {
            // The search packet is from this peer's server, packet should be forwarded to all in peer table except for index 0
            console.log(`Search query is from peer ${peerTable[0]} - excluded from forwarding\n`);
            // In order for the server to communicate, a new socket was created,
            // so this socket is thought to be a new peer and got added to peer table, remove it
            this.removePeer(socket.remoteAddress, socket.remotePort);
            this.sendToAllPeersExceptIndex(forwardPacket, 0);
        } else {
            // The search packet is from this peer's peer client
            let peerIndex = peerTable.indexOf(`${socket.remoteAddress}:${socket.remotePort}`);
            console.log(`Search query is from peer ${peerTable[peerIndex]} - excluded from forwarding\n`);
            this.sendToAllPeersExceptIndex(forwardPacket, peerIndex);
        }

        console.log(`Forwarding completed.\n`)
    },

    // Enforce only 1 client at a time
    isServerBusy: function () {
        return isServerBusy;
    },

    setIsServerBusy: function (isBusy) {
      isServerBusy = isBusy;
    }

};

function incrementTimer() {
    // reset timer after reaching 2^32
    if (timer === Math.pow(2, 32)) {
        timer = 0;
    }
    ++timer;
}