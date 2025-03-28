const fs = require('fs');
const path = require('path');

// Source and destination
const from = path.join(__dirname, '..', 'node_modules', 'tiktoken', 'tiktoken_bg.wasm');
const to = path.join(__dirname, '..', 'dist', 'tiktoken_bg.wasm');

// Copy the WASM file
fs.copyFileSync(from, to);
console.log('Copied tiktoken_bg.wasm to dist folder.');
