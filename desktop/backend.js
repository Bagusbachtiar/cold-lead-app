// Runs under the bundled Node runtime so SQLite keeps its existing native ABI.
const app = require('../server');
const db = require('../db');
const server = app.listen(Number(process.env.COLDREACH_PORT || 0), '127.0.0.1', () => {
  process.send?.({ type: 'ready', port: server.address().port });
});
let stopping = false;
let callbackServer, callbackReady;
// The main window uses a free port. Google's existing callback keeps port 3000.
app.locals.ensureOAuthCallback = () => {
  if (server.address()?.port === 3000) return Promise.resolve();
  if (!callbackReady) {
    callbackReady = new Promise((resolve, reject) => {
      callbackServer = app.listen(3000, '127.0.0.1', resolve);
      callbackServer.once('error', reject);
    }).catch(error => {
      callbackServer = null;
      callbackReady = null;
      throw error;
    });
  }
  return callbackReady;
};
function shutdown() {
  if (stopping) return;
  stopping = true;
  const servers = [server, callbackServer].filter(Boolean);
  Promise.all(servers.map(listener => new Promise(resolve => {
    listener.close(resolve);
    listener.closeAllConnections();
  }))).then(() => {
    if (db.open) db.close();
    process.exit(0);
  });
}
server.on('error', error => {
  process.send?.({ type: 'startup-error', code: error.code });
  if (db.open) db.close();
  process.exit(1);
});
app.on('gmail-connected', () => process.send?.({ type: 'gmail-connected' }));
process.on('message', message => { if (message?.type === 'shutdown') shutdown(); });
// Also stop if the desktop process crashes or is terminated.
process.on('disconnect', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
