
// Some properties of this peer node
let timer, sequenceNumber, PTPVersion, senderID, peerAddressTable, peerPortTable, peerTableSize;;
//TODO: add a table of peers tried for reconnection
module.exports = {
    init: function(version, peerID, tableSize) {

        // Initialize timer and sequenceNumber with a random number between 1 and 999
        timer = Math.floor((Math.random() * 999) + 1);
        sequenceNumber = Math.floor((Math.random() * 999) + 1);

        // Increment timer every 10ms
        setInterval(incrementTimer, 10);

        PTPVersion = version;
        senderID = peerID;
        peerAddressTable = [];
        peerPortTable = [];
        peerTableSize = tableSize;
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

    // Return the sender ID of this peer
    getSenderID: function () {
        return senderID;
    },

    // Check if the peer table is full
    isPeerTableFull: function() {
        return peerAddressTable.length === peerTableSize;
    },

    // Insert a new peer into the peer table
    addPeer: function(peerAddress, peerPort) {
        peerAddressTable.push(peerAddress);
        peerPortTable.push(peerPort);
    },

    // Return the peer IP address table
    getPeerAddressTable: function () {
        return peerAddressTable;
    },

    // Return the peer port table
    getPeerPortTable: function () {
        return peerPortTable;
    }
};

function incrementTimer() {
    // reset timer after reaching 2^32
    if (timer === Math.pow(2, 32)) {
        timer = 0;
    }
    ++timer;
}