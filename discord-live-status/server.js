const express = require('express');
const app = express();
const PORT = 3000;

// Serve site
app.use(express.static('public'));

// Start bot
require('./index.js');

app.listen(PORT, () => {
  console.log(`Website running on http://localhost:${PORT}`);
});
