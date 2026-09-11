const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

for (const mode of ['shutdown', 'disconnect']) {
  test(`desktop backend saves data and stops on ${mode}`, { timeout: 20000 }, async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coldreach-desktop-'));
    const child = fork(path.resolve(__dirname, '../desktop/backend.js'), [], {
      cwd: os.tmpdir(), silent: true,
      env: { ...process.env, COLDREACH_DATA_DIR: dataDir, COLDREACH_DESKTOP: '1', COLDREACH_PORT: '0' },
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, 'exit');
        child.kill();
        await exit;
      }
      assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(dataDir).startsWith('coldreach-desktop-'));
      fs.rmSync(dataDir, { recursive: true, force: true });
    });
    const [message] = await once(child, 'message');
    assert.equal(message.type, 'ready');
    const origin = `http://127.0.0.1:${message.port}`;
    const response = await fetch(origin + '/job-websites', {
      method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams({ name: 'Persisted website' }),
    });
    assert.equal(response.status, 200);
    const exit = once(child, 'exit');
    if (mode === 'disconnect') child.disconnect();
    else child.send({ type: 'shutdown' });
    const [code] = await exit;
    assert.equal(code, 0);
    await assert.rejects(fetch(origin));
    const db = new Database(path.join(dataDir, 'data.db'), { readonly: true });
    try { assert.equal(db.prepare('SELECT name FROM job_websites').get().name, 'Persisted website'); }
    finally { db.close(); }
  });
}
