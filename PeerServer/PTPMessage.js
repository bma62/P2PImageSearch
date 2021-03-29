const helpers = require('./helpers')

let packet = Buffer.alloc(0);

module.exports = {

  // Init a PTP packet
  init: function (version, messageType, senderID, peerAddressTable, peerPortTable) {

    let senderIDLength = senderID.length;

    // The packet length in bytes, the payload section has 6 bytes for each peer table entry
    let packetLength = 4 + senderIDLength + peerAddressTable.length * (4 + 2);
    packet = Buffer.alloc(packetLength);

    // Convert version from integer to binary and pad to 3 bits
    version = helpers.padStringToLength(helpers.int2bin(version), 3, 'Version not supported!');

    messageType = helpers.padStringToLength(helpers.int2bin(messageType), 8, 'Message type not supported!');

    const numberOfPeers = helpers.padStringToLength(helpers.int2bin(peerAddressTable.length), 13, 'Peer table size exceeds limit!');

    // Write first 3 bytes into packet
    packet.write(helpers.bin2hex(version + messageType + numberOfPeers), 0, 3, 'hex');
    let bufferOffset = 3;

    packet.writeUInt8(senderIDLength, bufferOffset);
    ++bufferOffset;

    // Load sender ID into packet
    Buffer.from(senderID)
        .copy(packet, bufferOffset);
    bufferOffset = bufferOffset + senderIDLength;

    // Repeat for each peer table entry
    peerAddressTable.forEach( (peerAddress, index) => {

      // Convert IP address to 32 bits
      let peerIPBits = '';
      peerAddress.split('.').forEach( octet => {
        peerIPBits += helpers.padStringToLength(helpers.int2bin(Number(octet)), 8, `Error converting peer IP address ${peerAddress}`);
      })

      packet.write(helpers.bin2hex(peerIPBits), bufferOffset, 4, 'hex');
      bufferOffset = bufferOffset + 4;

      packet.writeUInt16BE(peerPortTable[index], bufferOffset);
      bufferOffset = bufferOffset + 2;
    })
  },

  //--------------------------
  //getPacket: returns the entire packet
  //--------------------------
  getPacket: function() {
    return packet;
  }
};