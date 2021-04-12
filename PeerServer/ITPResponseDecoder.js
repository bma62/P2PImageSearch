const helpers = require("./helpers");
const P2PHandler = require("./PTPSearchPacketHandler");

module.exports = {
    decodeITPResponse: function(packet) {
        // Read first 4 bytes of the header, convert to binary string, and pad to 32-bit length
        let bufferOffset = 0;
        let header = helpers.padStringToLength(helpers.int2bin(packet.readUInt32BE(bufferOffset)), 32);
        bufferOffset = bufferOffset + 4;

        // First 3 bits is the version
        let version = helpers.bin2int(header.substring(0, 3));
        console.log(`\t--ITP version: ${version}`);

        let isFulfilled = header.substring(3, 4);
        if (isFulfilled === '0') {
            isFulfilled = 'No';
        }
        else {
            isFulfilled = 'Yes';
        }
        console.log(`\t--Fulfilled: ${isFulfilled}`);

        let responseType = helpers.bin2int(header.substring(4, 12));
        switch (responseType) {
            case 0:
                responseType = 'Query';
                break;
            case 1:
                responseType = 'Found';
                break;
            case 2:
                responseType = 'Not Found';
                break;
            case 3:
                responseType = 'Busy';
                break;
            default:
                responseType = 'Not Recognized';
        }
        console.log(`\t--Response Type: ${responseType}`);

        let imageCount = helpers.bin2int(header.substring(12, 17));
        console.log(`\t--Image Count: ${imageCount}`);

        let sequenceNumber = helpers.bin2int(header.substring(17));
        console.log(`\t--Sequence Number: ${sequenceNumber}`);

        // Second 4 bytes of the header is timestamp
        let timestamp = packet.readUInt32BE(bufferOffset);
        bufferOffset = bufferOffset + 4;
        console.log(`\t--Timestamp: ${timestamp}\n`);

        // Payload section
        let imageType = '',
            fileNameSize = 0,
            imageSize = 0,
            fileName = '';

        // Repeat payload section reading for each image
        for (let i = 0; i < imageCount; i++) {

            header = helpers.padStringToLength(helpers.int2bin(packet.readUInt16BE(bufferOffset)), 16);
            bufferOffset = bufferOffset + 2;

            imageType = helpers.bin2int(header.substring(0, 4));
            imageType = helpers.getImageExtension(imageType);
            fileNameSize = helpers.bin2int(header.substring(4));

            imageSize = packet.readUInt16BE(bufferOffset);
            bufferOffset = bufferOffset + 2;

            fileName = packet.slice(bufferOffset, bufferOffset + fileNameSize).toString();
            bufferOffset = bufferOffset + fileNameSize;

            let imageData = Buffer.from(packet.slice(bufferOffset, bufferOffset + imageSize));
            bufferOffset = bufferOffset + imageSize;

            P2PHandler.addFileFound(fileName, imageType, imageData);
        }
    }
}
