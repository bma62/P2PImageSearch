const helpers = require('./helpers')

let packet = Buffer.alloc(0);

module.exports = {

  // Init an ITP request packet
  init: function (version, imageArray, requestType) {

    let imageNameArray = [], imageTypeArray = [], fileNameSize = 0;

    // Split file names and extensions
    imageArray.forEach( item => {
      imageNameArray.push(item.split('.')[0]);
      fileNameSize += item.split('.')[0].length; // The total length of file names
      imageTypeArray.push(item.split('.')[1]);
    });

    // The packet length in bytes, the payload section has 2 bytes header for each image
    let packetLength = 4 + 2 * imageNameArray.length + fileNameSize;
    packet = Buffer.alloc(packetLength);

    // Convert version from integer to binary and pad to 3 bits
    if (version !== 7) {
      throw new Error('Version not supported!');
    }
    let v = helpers.int2bin(version);
    v = helpers.padStringToLength(v, 3, 'Version not supported!');

    let ic = helpers.int2bin(imageNameArray.length);
    ic = helpers.padStringToLength(ic, 5, 'Image count exceeds 31!')

    // Write first byte of V and IC into packet
    packet.write(helpers.bin2hex(v+ic), 0, 1, 'hex');
    packet.write('0000', 1, 2, 'hex'); // Reserved 2 bytes

    // Last byte in header is the request type
    if (requestType === 0) {
      packet.write('00', 3, 1, 'hex');
    }
    else {
      throw new Error('Request type not supported!');
    }

    // Write payload for each image requested
    let bufferOffset = 4;

    imageNameArray.forEach( (imageName, index) => {

      // Convert imageType to binary and pad to 4 bits
      let imageType = helpers.int2bin(helpers.getImageType(imageTypeArray[index]));
      imageType = helpers.padStringToLength(imageType, 4, 'Image type not supported!');

      let fileNameSize = helpers.int2bin(imageName.length);
      fileNameSize = helpers.padStringToLength(fileNameSize, 12, 'File name too long!');

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
  //getBytePacket: returns the entire packet in bytes
  //--------------------------
  getBytePacket: function () {
    return packet;
  },

  //--------------------------
  //getBitPacket: returns the entire packet in bits format
  //--------------------------
  getBitPacket: function () {
    let packetBits = '';
    packet.forEach( byte => {
      // Convert packet to binary bits
      packetBits += helpers.padStringToLength(byte.toString(2), 8, 'Error converting packet to bits');
    });

    return packetBits;
  },
};