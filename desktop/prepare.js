const fs = require('node:fs');
const path = require('node:path');
const runtime = path.join(__dirname, 'runtime');
fs.mkdirSync(runtime, { recursive: true });
fs.copyFileSync(process.execPath, path.join(runtime, 'node.exe'));
console.log('Prepared the local Node runtime for ColdReach.');
