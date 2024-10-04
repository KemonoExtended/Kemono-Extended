const path = require('path');

module.exports = {
  entry: './KemonoExtended.js', // Your main js file
  output: {
    filename: 'KemonoExtended.js', // The bundled js file
    path: path.resolve(__dirname, 'dist'), // The folder where the bundled file will be placed
  },
  mode: 'production'
};

