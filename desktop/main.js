const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

app.setName('ColdReach');
app.setPath('userData', process.env.COLDREACH_USER_DATA_DIR || path.join(app.getPath('appData'), 'ColdReach'));
let window, backend, stopping = false, stopped = false;

function dataDirectory() {
  if (process.env.COLDREACH_DATA_DIR) return path.resolve(process.env.COLDREACH_DATA_DIR);
  if (!app.isPackaged) return path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(process.resourcesPath, 'coldreach-local.json'), 'utf8'));
  if (!path.isAbsolute(config.dataDirectory) || !fs.existsSync(path.join(config.dataDirectory, 'data.db'))) {
    throw new Error('Your existing data.db could not be found. Restore the project folder before opening ColdReach.');
  }
  return config.dataDirectory;
}

function startBackend() {
  const dataDir = dataDirectory();
  const runtime = app.isPackaged ? path.join(process.resourcesPath, 'runtime', 'node.exe') : path.join(__dirname, 'runtime', 'node.exe');
  backend = spawn(runtime, [path.join(__dirname, 'backend.js')], {
    cwd: dataDir, windowsHide: true,
    env: { ...process.env, COLDREACH_DATA_DIR: dataDir, COLDREACH_DESKTOP: '1' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ColdReach took too long to start. Please try again.')), 30000);
    backend.once('error', error => { clearTimeout(timer); reject(error); });
    backend.once('exit', () => {
      clearTimeout(timer);
      if (!stopping) {
        reject(new Error('The local server stopped unexpectedly.'));
        if (window) {
          dialog.showErrorBox('ColdReach stopped', 'The local server stopped unexpectedly. Reopen ColdReach to continue.');
          app.quit();
        }
      }
    });
    backend.on('message', message => {
      if (message.type === 'ready') { clearTimeout(timer); resolve(`http://127.0.0.1:${message.port}`); }
      if (message.type === 'startup-error') {
        clearTimeout(timer);
        reject(new Error(`Could not start the local server (${message.code || 'unknown error'}).`));
      }
      if (message.type === 'gmail-connected' && window && !window.isDestroyed()) {
        window.reload();
        if (window.isMinimized()) window.restore();
        window.focus();
      }
    });
  });
}

async function stopBackend() {
  if (!backend?.pid || backend.exitCode !== null || backend.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => backend.kill(), 3000);
    backend.once('exit', () => { clearTimeout(timer); resolve(); });
    if (backend.connected) backend.send({ type: 'shutdown' }, () => {});
    else backend.kill();
  });
}

function external(url) {
  try {
    if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) shell.openExternal(url).catch(() => {});
  } catch { /* Ignore malformed external links. */ }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (stopped) return;
    event.preventDefault();
    if (stopping) return;
    stopping = true;
    stopBackend().finally(() => { stopped = true; app.quit(); });
  });
  app.whenReady().then(async () => {
    const origin = await startBackend();
    if (stopping) return;
    window = new BrowserWindow({
      title: 'ColdReach', width: 1120, height: 820, minWidth: 700, minHeight: 550,
      show: process.env.COLDREACH_TEST !== '1',
      backgroundColor: '#030712', autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    window.removeMenu();
    window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
    function navigate(event, url) {
      if (url === `${origin}/auth/login`) {
        event.preventDefault();
        external(url);
      } else if (new URL(url).origin !== origin) {
        event.preventDefault();
        external(url);
      }
    }
    window.webContents.on('will-navigate', navigate);
    window.webContents.on('will-redirect', navigate);
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (new URL(url).origin === origin && url !== `${origin}/auth/login`) window.loadURL(url);
      else external(url);
      return { action: 'deny' };
    });
    await window.loadURL(origin);
  }).catch(error => {
    dialog.showErrorBox('Could not open ColdReach', error.message);
    app.quit();
  });
}
