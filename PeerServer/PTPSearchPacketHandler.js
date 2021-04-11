const helpers = require('./helpers')

module.exports = {

    decodePTPSearchPacket: function (socket, searchPacket) {
        console.log('P2P search packet received: ');

        let bufferOffset = 0;
        let header = helpers.padStringToLength(helpers.int2bin(searchPacket.readUInt16BE(bufferOffset)), 16);

        let version = helpers.bin2int(header.substring(0, 3));
        console.log(`\t--P2P version: ${version}`);

        let msgType = helpers.bin2int(header.substring(3, 11));
        if (msgType === 3) {
            console.log('\t--Message Type: Search');
        } else {
            console.log('\t--Message Type: Not Recognized!');
        }

        let imageCount = helpers.bin2int(header.substring(11));
        console.log(`\t--Image count: ${imageCount}`);

        bufferOffset = 2; // Skip byte 2-3 as they are reserved and not used

        let searchID = searchPacket.readUInt8(bufferOffset);
        console.log(`\t--Search ID: ${searchID}`);
        ++bufferOffset;

        let sendIdLength = searchPacket.readUInt8(bufferOffset);
        ++bufferOffset;
        let sendID = searchPacket.slice(bufferOffset, bufferOffset + sendIdLength).toString()
        bufferOffset = bufferOffset + sendIdLength;

        let peerIP = helpers.padStringToLength(helpers.int2bin(searchPacket.readUInt32BE(bufferOffset)), 32);
        bufferOffset = bufferOffset + 4;

        peerIP = helpers.bin2int(peerIP.substring(0, 8)) + '.' +
            helpers.bin2int(peerIP.substring(8, 16)) + '.' +
            helpers.bin2int(peerIP.substring(16, 24)) + '.' +
            helpers.bin2int(peerIP.substring(24, 32));
        console.log(`\t--Originating Peer's IP: ${peerIP}`);

        let peerPort = searchPacket.readUInt16BE(bufferOffset);
        console.log(`\t--Originating Peer's Image Port: ${peerPort}`);
        bufferOffset = bufferOffset + 2;

        let imageType = '', imageNameSize = 0, imageTypeArray = [], imageNameArray = [];
        for (let i = 0; i < imageCount; i++) {

            // First 2 bytes of payload is image type and image name size
            header = helpers.padStringToLength(helpers.int2bin(searchPacket.readUInt16BE(bufferOffset)), 16);
            imageType = helpers.bin2int(header.substring(0, 4)); // Bit 1-4 is image type
            imageTypeArray.push(helpers.getImageExtension(imageType)); // Convert to extension name and add to array
            imageNameSize = helpers.bin2int(header.substring(4)); // Bit 5-16 is image name size

            bufferOffset = bufferOffset + 2; // Shift buffer offset to read image name

            // As this range of buffer is characters, they can be pushed together as the full name string
            imageNameArray.push(searchPacket.slice(bufferOffset, bufferOffset + imageNameSize).toString());

            bufferOffset = bufferOffset + imageNameSize; // Move on to next image
        }

        console.log(`\t--Image file extension(s): ${imageTypeArray.toString()}`);
        console.log(`\t--Image file name(s): ${imageNameArray.toString()}`);
    }
}