// Helper functions used throughout the program
module.exports = {

    // Convert binary string to hexadecimal
    bin2hex: function (bin) {
        return parseInt(bin, 2).toString(16);
    },

    // Convert binary string to integer
    bin2int: function (bin) {
        return parseInt(bin, 2);
    },

    // Convert integer to binary string
    int2bin: function (int) {
        return int.toString(2);
    },

    // Pad str with 0s from the left to reach targetLength
    padStringToLength: function (str, targetLength) {
        if (str.length < targetLength) {
            return str.padStart(targetLength, '0');
        } else if (str.length === targetLength) {
            return str;
        }
    },

    // Convert image extension to number representation
    getImageType: function (extension) {
        let type = extension.toLowerCase();
        switch (type) {
            case 'bmp':
                return 1;
            case 'jpeg':
                return 2;
            case 'gif':
                return 3;
            case 'png':
                return 4;
            case 'tiff':
                return 5;
            case 'raw':
                return 15;
            default:
                throw new Error(`Image type ${extension} not supported!`);
        }
    },

    // Convert number representation to image extension
    getImageExtension: function (type) {
        switch (type) {
            case 1:
                return 'bmp';
            case 2:
                return 'jpeg';
            case 3:
                return 'gif';
            case 4:
                return 'png';
            case 5:
                return 'tiff';
            case 15:
                return 'raw';
            default:
                throw new Error(`Image type ${type} not supported!`);
        }
    }
};