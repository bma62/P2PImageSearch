const helpers = require('./helpers'),
    singleton = require('./Singleton'),
    ITPpacket = require('./ITPResponse'),
    fs = require('fs'),
    net = require('net');

let clientSocket, fileNameToBeFound, foundFileName, foundFileType, foundFileData;

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

        bufferOffset = 2;

        let searchID = searchPacket.readUInt8(bufferOffset);
        console.log(`\t--Search ID: ${searchID}`);
        ++bufferOffset;

        let senderIdLength = searchPacket.readUInt8(bufferOffset);
        ++bufferOffset;
        let senderID = searchPacket.slice(bufferOffset, bufferOffset + senderIdLength).toString();
        bufferOffset = bufferOffset + senderIdLength;
        console.log(`\t--Sender ID: ${senderID}`);

        let originatingPeerIP = helpers.padStringToLength(helpers.int2bin(searchPacket.readUInt32BE(bufferOffset)), 32);
        bufferOffset = bufferOffset + 4;

        originatingPeerIP = helpers.bin2int(originatingPeerIP.substring(0, 8)) + '.' +
            helpers.bin2int(originatingPeerIP.substring(8, 16)) + '.' +
            helpers.bin2int(originatingPeerIP.substring(16, 24)) + '.' +
            helpers.bin2int(originatingPeerIP.substring(24, 32));
        console.log(`\t--Originating Peer's IP: ${originatingPeerIP}`);

        let originatingPeerPort = searchPacket.readUInt16BE(bufferOffset);
        console.log(`\t--Originating Peer's Image Port: ${originatingPeerPort}`);
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
        console.log(`\t--Image file name(s): ${imageNameArray.toString()}\n`);

        // If the search has been seen, simply return to ignore the request
        if (singleton.hasSeenSearch(originatingPeerIP, originatingPeerPort, searchID)) {
            console.log('The query was seen previously - ignored\n');
            return;
        }

        console.log('New query - added to seen searches\n')
        singleton.addSearchHistory(originatingPeerIP, originatingPeerPort, searchID);

        let responseImageName = [], responseImageType = [], responseImage = [];
        imageNameArray.forEach((imageName, index) => {
            let fileName = `${imageName}.${imageTypeArray[index]}`;
            try {
                // Image is found
                let imageData = fs.readFileSync(`images/${fileName}`);
                responseImageName.push(imageName);
                responseImageType.push(imageTypeArray[index]);
                responseImage.push(imageData);
            } catch (err) {
                // Image not found
            }
        })

        // All images are found
        if (responseImageName.length === imageNameArray.length) {
            console.log('All images found locally - transmission will begin with the originating peer...\n');

            ITPpacket.init(version, true, false, singleton.getSequenceNumber(),
                singleton.getTimestamp(), responseImageType, responseImageName, responseImage);
            let responsePacket = ITPpacket.getPacket();
            // Add a one-byte delimiter for client to concatenate buffer chunks
            const delimiter = Buffer.from('\n');
            responsePacket = Buffer.concat([responsePacket, delimiter]);

            // Start a new socket and connect directly to originating peer's image port
            let imageClient = new net.Socket();
            imageClient.connect(originatingPeerPort, originatingPeerIP, () => {
                imageClient.write(responsePacket);
                imageClient.end();
            })

        } else if (responseImage.length !== 0) {
            // Partial images found
            console.log('Partial images found locally - transmission will begin with the originating peer...\n');

            ITPpacket.init(version, false, false, singleton.getSequenceNumber(),
                singleton.getTimestamp(), responseImageType, responseImageName, responseImage);
            let responsePacket = ITPpacket.getPacket();
            // Add a one-byte delimiter for client to concatenate buffer chunks
            const delimiter = Buffer.from('\n');
            responsePacket = Buffer.concat([responsePacket, delimiter]);

            // Start a new socket and connect directly to originating peer's image port
            let imageClient = new net.Socket();
            imageClient.connect(originatingPeerPort, originatingPeerIP, () => {
                imageClient.write(responsePacket);
                imageClient.end();
            });

            // Update the array of images to be found
            let requestImageFullName = [];
            imageNameArray.forEach( (imageName, index) => {
                requestImageFullName.push(`${imageName}.${imageTypeArray[index]}`);

            })
            let responseImageFullName = [];
            responseImageName.forEach( (imageName, index) => {
                responseImageFullName.push(`${imageName}.${responseImageType[index]}`);
            })

            // Remove found elements from query elements
            requestImageFullName = requestImageFullName.filter (element => {
                return responseImageFullName.indexOf(element) < 0;
            });

            imageNameArray = [];
            imageTypeArray = [];
            requestImageFullName.forEach( imageFullName => {
                imageNameArray.push(imageFullName.split('.')[0]);
                imageTypeArray.push(imageFullName.split('.')[1]);
            })

            console.log('Partial images not found - forwarding query to other peers...');
            singleton.forwardP2PSearchPacket(originatingPeerIP, originatingPeerPort, senderID,
                version, searchID, imageNameArray, imageTypeArray, socket);
        } else {
            // No image is found
            console.log('Image not found - forwarding query to other peers...');
            singleton.forwardP2PSearchPacket(originatingPeerIP, originatingPeerPort, senderID,
                version, searchID, imageNameArray, imageTypeArray, socket);
        }

    },

    // Save found images before sending P2P search packet
    saveCurrentProgress: function (socket, fullFileNameToBeFound, foundImageName, foundImageType, foundImageData) {
        clientSocket = socket;
        fileNameToBeFound = fullFileNameToBeFound;
        foundFileName = foundImageName;
        foundFileType = foundImageType;
        foundFileData = foundImageData;
    },

    // If a peer finds an image, save it
    addFileFound: function (fileName, fileType, fileData) {

        console.log(`Received ${fileName}.${fileType} from peer.\n`)
        let index = fileNameToBeFound.indexOf(`${fileName}.${fileType}`);

        if (index > -1) {
            // The image is still missing, so add it to found
            foundFileName.push(fileName);
            foundFileType.push(fileType);
            foundFileData.push(fileData);

            //Remove from to be found
            fileNameToBeFound.splice(index, 1);
        }

        // All images found, send packet to client
        if (fileNameToBeFound.length === 0) {
            ITPpacket.init(7, true, false, singleton.getSequenceNumber(),
                singleton.getTimestamp(), foundFileType, foundFileName, foundFileData);

            let responsePacket = ITPpacket.getPacket();

            const delimiter = Buffer.from('\n');
            responsePacket = Buffer.concat([responsePacket, delimiter]);

            // Send to client
            clientSocket.write(responsePacket);

            // Free server for next client
            singleton.setIsServerBusy(false);
        }
    }
}