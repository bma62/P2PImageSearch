
const helpers = require('./helpers');
let packet = Buffer.alloc(0);

module.exports = {

    init: function(version, isFulfilled, isServerBusy, sequenceNumber, timestamp, imageTypeArray, imageNameArray, imageArray) {

        // The packet length is at least 8 bytes of the fixed header
        let packetLength = 8, bufferOffset = 0;

        // Payload section length
        imageNameArray.forEach( (imageName, index) => {
            packetLength += (4 + imageName.length + Buffer.byteLength(imageArray[index]));
        });

        packet = Buffer.alloc(packetLength);

        let v, f, responseType, ic, it, fileNameSize;

        v = helpers.padStringToLength(helpers.int2bin(version), 3);

        // Check isFulfilled
        if (isFulfilled) {
            f = '1';
        }
        else {
            f = '0';
        }

        // Check if any image is found or if server is busy
        if (isServerBusy) {
            responseType = helpers.padStringToLength(helpers.int2bin(3), 8);
        }
        else if (imageNameArray.length > 0) {
            // Found
            responseType = helpers.padStringToLength(helpers.int2bin(1), 8);
        }
        else {
            // Not found
            responseType = helpers.padStringToLength(helpers.int2bin(2), 8);
        }

        // There is restriction on the client side for not requesting more than 31 images, so no need to check here
        ic = helpers.padStringToLength(helpers.int2bin(imageNameArray.length), 5);

        // Sequence number
        sequenceNumber = sequenceNumber % Math.pow(2, 15);
        sequenceNumber = helpers.padStringToLength(helpers.int2bin(sequenceNumber), 15);

        // Write first 4 bytes into the packet
        Buffer.from(helpers.bin2hex(v + f + responseType + ic + sequenceNumber), 'hex')
            .copy(packet, bufferOffset);
        bufferOffset = bufferOffset + 4;

        packet.writeUInt32BE(timestamp, bufferOffset);
        bufferOffset = bufferOffset + 4;

        // Repeat the payload section for each image
        imageNameArray.forEach( (imageName,index) => {

            // Image Type
            it = helpers.getImageType(imageTypeArray[index]);
            it = helpers.padStringToLength(helpers.int2bin(it), 4);

            fileNameSize = helpers.padStringToLength(helpers.int2bin(imageName.length), 12);

            Buffer.from(helpers.bin2hex(it+fileNameSize), 'hex')
                .copy(packet, bufferOffset);
            bufferOffset = bufferOffset + 2;

            // Image size in bytes
            packet.writeUInt16BE(Buffer.byteLength(imageArray[index]), bufferOffset);
            bufferOffset = bufferOffset + 2;

            // Image file name
            Buffer.from(imageName)
                .copy(packet, bufferOffset);
            bufferOffset = bufferOffset + imageName.length;

            // Image data
            imageArray[index].copy(packet, bufferOffset);
            bufferOffset = bufferOffset + Buffer.byteLength(imageArray[index]);
        })
    },

    //--------------------------
    //getpacket: returns the entire packet
    //--------------------------
    getPacket: function() {
        // enter your code here
        return packet;
    },

    decodeITPResponse: function(packet) {
        // Read first 4 bytes of the header, convert to binary string, and pad to 32-bit length
        let bufferOffset = 0;
        let header = this.padStringToLength(this.int2bin(packet.readUInt32BE(bufferOffset)), 32);
        bufferOffset = bufferOffset + 4;

        // First 3 bits is the version
        let version = this.bin2int(header.substring(0, 3));
        console.log(`\t--ITP version: ${version}`);

        let isFulfilled = header.substring(3, 4);
        if (isFulfilled === '0') {
            isFulfilled = 'No';
        }
        else {
            isFulfilled = 'Yes';
        }
        console.log(`\t--Fulfilled: ${isFulfilled}`);

        let responseType = this.bin2int(header.substring(4, 12));
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

        let imageCount = this.bin2int(header.substring(12, 17));
        console.log(`\t--Image Count: ${imageCount}`);

        let sequenceNumber = this.bin2int(header.substring(17));
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

            header = this.padStringToLength(this.int2bin(packet.readUInt16BE(bufferOffset)), 16);
            bufferOffset = bufferOffset + 2;

            imageType = this.bin2int(header.substring(0, 4));
            imageType = this.getImageExtension(imageType);
            fileNameSize = this.bin2int(header.substring(4));

            imageSize = packet.readUInt16BE(bufferOffset);
            bufferOffset = bufferOffset + 2;

            fileName = packet.slice(bufferOffset, bufferOffset + fileNameSize).toString();
            bufferOffset = bufferOffset + fileNameSize;

            let imageData = Buffer.from(packet.slice(bufferOffset, bufferOffset + imageSize));
            bufferOffset = bufferOffset + imageSize;

            P2PHandler.addFileFound(fileName, imageType, imageData);
        }
    }
};