const helpers = require('./helpers');

let packet = Buffer.alloc(0);

module.exports = {

    // Init a PTP packet
    init: function (version, messageType, searchID, senderID, originatingAddress, originatingPort, fullFileNameArray) {
        let imageTypeArray = [], imageNameArray = [];
        fullFileNameArray.forEach( fileName => {
            imageNameArray.push(fileName.split('.')[0]);
            imageTypeArray.push(fileName.split('.')[1]);
        })

        let senderIDLength = senderID.length, imageNameLength = 0;

        imageNameArray.forEach(imageName => {
            imageNameLength += imageName.length;
        })

        // The packet length in bytes
        let packetLength = 4 + senderIDLength + 4 + 2 + imageTypeArray.length * 2 + imageNameLength;
        packet = Buffer.alloc(packetLength);

        // Convert version from integer to binary and pad to 3 bits
        version = helpers.padStringToLength(helpers.int2bin(version), 3);

        messageType = helpers.padStringToLength(helpers.int2bin(messageType), 8);

        const imageCount = helpers.padStringToLength(helpers.int2bin(imageTypeArray.length), 5)

        // Write first 2 bytes into packet
        packet.write(helpers.bin2hex(version + messageType + imageCount), 0, 2, 'hex');
        let bufferOffset = 2;

        packet.writeUInt8(searchID % Math.pow(2, 8), bufferOffset);
        ++bufferOffset;

        packet.writeUInt8(senderIDLength, bufferOffset);
        ++bufferOffset;

        // Load sender ID into packet
        Buffer.from(senderID)
            .copy(packet, bufferOffset);
        bufferOffset = bufferOffset + senderIDLength;

        // Write in originating peer info
        // Convert IP address to 32 bits
        let peerIPBits = '';
        originatingAddress.split('.').forEach(octet => {
            peerIPBits += helpers.padStringToLength(helpers.int2bin(Number(octet)), 8);
        })

        packet.write(helpers.bin2hex(peerIPBits), bufferOffset, 4, 'hex');
        bufferOffset = bufferOffset + 4;

        packet.writeUInt16BE(originatingPort, bufferOffset);
        bufferOffset = bufferOffset + 2;

        imageNameArray.forEach((imageName, index) => {
            // Convert imageType to binary and pad to 4 bits
            let imageType = helpers.int2bin(helpers.getImageType(imageTypeArray[index]));
            imageType = helpers.padStringToLength(imageType, 4,);

            let fileNameSize = helpers.int2bin(imageName.length);
            fileNameSize = helpers.padStringToLength(fileNameSize, 12);

            // Convert the 2 byte payload header to buffer and copy into packet
            Buffer.from(helpers.bin2hex(imageType + fileNameSize), 'hex')
                .copy(packet, bufferOffset);
            bufferOffset = bufferOffset + 2;

            // Load file name into packet
            Buffer.from(imageName)
                .copy(packet, bufferOffset);

            bufferOffset = bufferOffset + imageName.length;
        })
    },

    //--------------------------
    //getPacket: returns the entire packet
    //--------------------------
    getPacket: function () {
        return packet;
    }
};