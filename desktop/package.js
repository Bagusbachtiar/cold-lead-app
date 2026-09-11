const fs = require('node:fs');
const path = require('node:path');

async function build() {
  require('./prepare');
  const { packager } = await import('@electron/packager');
  const root = path.resolve(__dirname, '..');
  const config = path.join(__dirname, 'runtime', 'coldreach-local.json');
  fs.writeFileSync(config, JSON.stringify({ dataDirectory: root }, null, 2));
  const paths = await packager({
    dir: root, out: path.join(root, 'dist'), name: 'ColdReach', executableName: 'ColdReach',
    platform: 'win32', arch: process.arch, asar: false, prune: true, overwrite: true,
    // Explicitly exclude data, credentials, tests, and generated artifacts.
    ignore: [
      /^\/(?!node_modules(?:\/|$)|desktop(?:\/|$)|package.json$|server.js$|db.js$|jobs.js$|job-websites.js$|job-websites-client.js$)/,
      /^\/desktop\/(?!main.js$|backend.js$)/,
    ],
    extraResource: [path.join(__dirname, 'runtime'), config],
    win32metadata: { CompanyName: 'ColdReach', FileDescription: 'ColdReach local CRM', ProductName: 'ColdReach' },
  });
  console.log(`Desktop app ready: ${path.join(paths[0], 'ColdReach.exe')}`);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
