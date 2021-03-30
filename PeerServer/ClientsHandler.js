
const fs = require('fs'),
    ITPpacket = require('./ITPResponse'),
    singleton = require('./Singleton'),
    PTPpacket = require('./PTPMessage'),
    helpers = require('./helpers');

module.exports = {

    handleClientJoining: function (sock) {

        const timeStamp = singleton.getTimestamp();
        console.log(`Client-${timeStamp} is connected at timestamp: ${timeStamp}\n`);

        let requestPacket = Buffer.alloc(0);

        // Receive data from the socket
        sock.on('data', (data) => {

            // Concatenate data in case the packet is divided into multiple chunks
            requestPacket = Buffer.concat([requestPacket, data]);

            // Check for the delimiter for complete packet
            if (requestPacket.slice(-1).toString() === '\n'){
                // Remove the delimiter
                requestPacket = requestPacket.slice(0, -1);

                // Handle packet
                printPacket(requestPacket);
                decodePacket(requestPacket, timeStamp);
                servePacket(sock);
            }
        });

        sock.on('close', () => {
            console.log(`Client-${timeStamp} closed the connection.\n`);
        });

        sock.on('error', (err) => {
            console.log(`Error: ${err}`);
        });
    },

    handlePeerJoining: function (sock) {

        const peerAddress = sock.remoteAddress,
            peerPort = sock.remotePort;

        // If the peer table is full, the connecting peer needs to be redirected
        if (singleton.isPeerTableFull()) {

            console.log(`Peer table full: ${peerAddress}:${peerPort} redirected\n`);

            // Form re-direct packet
            PTPpacket.init(singleton.getPTPVersion(), 2, singleton.getSenderID(),
                singleton.getPeerAddressTable(), singleton.getPeerPortTable());
            let packet = PTPpacket.getPacket();

            // Add a one-byte delimiter for client to concatenate buffer chunks
            const delimiter = Buffer.from('\n');
            packet = Buffer.concat([packet, delimiter])

            // Send to client and close the connection
            sock.write(packet);
            sock.end();
        }
        // If the peer table is not full, accept connection and update peer table
        else {

            console.log(`Connected from peer: ${peerAddress}:${peerPort}\n`);

            // Form welcome packet
            PTPpacket.init(singleton.getPTPVersion(), 1, singleton.getSenderID(),
                singleton.getPeerAddressTable(), singleton.getPeerPortTable());
            let packet = PTPpacket.getPacket();

            // Add a one-byte delimiter for client to concatenate buffer chunks
            const delimiter = Buffer.from('\n');
            packet = Buffer.concat([packet, delimiter])

            // Send to client and add peer info to table
            sock.write(packet);
            singleton.addPeer(peerAddress, peerPort);
        }

        sock.on('error', (err) => {
            console.log(`Error: ${err}\n`);
        });
    }
};

function printPacket(packet) {
    console.log('ITP packet received:');

    let displayColumn = 4, packetBits = '';

    packet.forEach( byte => {
        // Convert each byte to binary string and pad to 8 bits
        packetBits += helpers.padStringToLength(byte.toString(2), 8);
        packetBits += ' ';
        --displayColumn;
        if (displayColumn === 0) {
            packetBits += '\n';
            displayColumn = 4;
        }
    });

    console.log(packetBits);
}

let imageCount = 0, imageTypeArray = [], imageNameArray = [],
    fileArray = [], fileNameArray = [], fileTypeArray = [];

function decodePacket(packet, timeStamp) {
    console.log(`\nClient-${timeStamp} requests:`);

    // First byte of packet
    let bufferOffset = 0;
    let header = helpers.padStringToLength(helpers.int2bin(packet.readUInt8(bufferOffset)), 8);

    // Bit 1-3 is version
    let version = helpers.bin2int(header.substring(0, 3));
    console.log(`\t--ITP version: ${version}`);

    // Bit 4-8 is image count
    imageCount = helpers.bin2int(header.substring(3));
    console.log(`\t--Image count: ${imageCount}`);

    bufferOffset = bufferOffset + 3; // Skip byte 2-3 as they are reserved and not used

    // 4th byte is request type
    let requestType = packet.readUInt8(bufferOffset);
    if (requestType === 0) {
        console.log(`\t--Request type: Query`);
    }
    else {
        console.log(`\t--Request type: Unexpected!`);
    }

    // Repeat for the payload part to read image names and types
    ++bufferOffset;
    let imageType = '', imageNameSize = 0;
    for (let i = 0; i < imageCount; i++) {

        // First 2 bytes of payload is image type and image name size
        header = helpers.padStringToLength(helpers.int2bin(packet.readUInt16BE(bufferOffset)), 16);
        imageType = helpers.bin2int(header.substring(0, 4)); // Bit 1-4 is image type
        imageTypeArray.push(helpers.getImageExtension(imageType)); // Convert to extension name and add to array
        imageNameSize = helpers.bin2int(header.substring(4)); // Bit 5-16 is image name size

        bufferOffset = bufferOffset + 2; // Shift buffer offset to read image name

        // As this range of buffer is characters, they can be pushed together as the full name string
        imageNameArray.push(packet.slice(bufferOffset, bufferOffset + imageNameSize).toString());

        bufferOffset = bufferOffset + imageNameSize; // Move on to next image
    }

    console.log(`\t--Image file extension(s): ${imageTypeArray.toString()}`);
    console.log(`\t--Image file name(s): ${imageNameArray.toString()}`);
}

function servePacket(sock) {

    let promises = [];

    // Check for each image if they exist
    imageNameArray.forEach( (imageName, index) => {
        // Read files asynchronously
        promises.push(readFromFile(imageName, imageTypeArray[index]));
    })

    // Wait until all promises are resolved, i.e. file-readings are all done
    Promise.all(promises)
        .then(() => {

            // Form response packet
            // If the number of files found are same as total images requested, then it is fulfilled
            ITPpacket.init(7, fileNameArray.length === imageCount, singleton.getSequenceNumber(),
                singleton.getTimestamp(), fileTypeArray, fileNameArray, fileArray);
            let packet = ITPpacket.getPacket();

            // Add a one-byte delimiter for client to concatenate buffer chunks
            let delimiter = Buffer.from('\n');
            packet = Buffer.concat([packet, delimiter])

            // Send to client
            sock.write(packet);

            // Clear the arrays for next client
            imageNameArray = [];
            imageTypeArray = [];
            fileNameArray = [];
            fileTypeArray = [];
            fileArray = [];
        })

        // Error shouldn't happen as all promises are resolved regardless whether the image is found
        .catch(err => {
            console.log(err);
        })
}

function readFromFile(fileName, fileExtension) {
    return new Promise((resolve, reject) => {
        let file = `${fileName}.${fileExtension}`;

        fs.readFile(`images/${file}`, (err, image) => {
            if (err) {
                // File not found, but still mark the promise as resolved as we are using our own file array
                resolve();
            }
            else {
                // File found, push the buffer and its name
                fileArray.push(image);
                fileNameArray.push(fileName);
                fileTypeArray.push(fileExtension);
                resolve();
            }
        });
    });
}