const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js');
const destDir = path.join(__dirname, '..', 'dist'); // or "media" or somewhere
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}
const dest = path.join(destDir, 'toolkit.min.js');
fs.copyFileSync(src, dest);
console.log('Copied toolkit.min.js to dist folder.');
