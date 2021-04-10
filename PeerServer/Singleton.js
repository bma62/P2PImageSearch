
const net = require('net');

// Some properties of this peer node
let timer, sequenceNumber, PTPVersion, searchID = 0, senderID, peerTable, peerTableSize,
    originatingAddress, originatingPort; //Added variables to hold image port info
//TODO: add a table of seen searches
module.exports = {
    init: function(version, peerID, tableSize, imageDBAddress, imageDBPort) {

        // Initialize timer and sequenceNumber with a random number between 1 and 999
        timer = Math.floor((Math.random() * 999) + 1);
        sequenceNumber = Math.floor((Math.random() * 999) + 1);

        // Increment timer every 10ms
        setInterval(incrementTimer, 10);

        PTPVersion = version;
        senderID = peerID;
        peerTable = [];
        peerTableSize = tableSize;
        originatingAddress = imageDBAddress;
        originatingPort = imageDBPort;
    },

    //--------------------------
    //getSequenceNumber: return the current sequence number + 1
    //--------------------------
    getSequenceNumber: function() {
        ++sequenceNumber;
        return sequenceNumber;
    },

    //--------------------------
    //getTimestamp: return the current timer value
    //--------------------------
    getTimestamp: function() {
        return timer;
    },

    // Return the PTP version to use in the packet header
    getPTPVersion: function() {
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
    isPeerTableFull: function() {
        return peerTable.length === peerTableSize;
    },

    // Insert a new peer into the peer table
    addPeer: function(peerAddress, peerPort) {
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
        // peerSocketTable.forEach( peerSocket => {
        //     peerSocket.write(packet);
        // })

        peerTable.forEach( (peerAddress, index) => {
            let peerClient = new net.Socket();
            peerClient.connect(peerAddress.split(':')[1], peerAddress.split(':')[0]);
            peerClient.write(packet);
        })
    }
};

function incrementTimer() {
    // reset timer after reaching 2^32
    if (timer === Math.pow(2, 32)) {
        timer = 0;
    }
    ++timer;
}