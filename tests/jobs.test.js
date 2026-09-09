const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const Database = require('better-sqlite3');

test('job application workflow persists data and leaves outreach records alone', async t => {
  // Load the real app against a disposable database, never the user's data.db.
  const directory = mkdtempSync(path.join(tmpdir(), 'coldreach-jobs-'));
  const previousDirectory = process.cwd();
  let db, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db?.open) db.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('coldreach-jobs-'));
    rmSync(directory, { recursive: true, force: true });
  });
  let app;
  process.chdir(directory);
  try {
    db = require('../db');
    db.prepare("INSERT INTO leads (business_name, status) VALUES ('Existing lead', 'waiting')").run();
    db.prepare("INSERT INTO templates (name, channel, body) VALUES ('Existing template', 'email', 'Hello')").run();
    // Re-running the schema is safe for existing installations.
    db.close();
    delete require.cache[require.resolve('../db')];
    db = require('../db');
    app = require('../server');
  } finally {
    process.chdir(previousDirectory);
  }
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = url => fetch(base + url);
  const post = (url, data = {}) => fetch(base + url, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams(data),
  });
  const application = {
    company: 'Acme & Co', role: 'Frontend Developer', applied_on: '2026-09-09',
    job_url: 'https://example.com/jobs/123', status: 'applied', notes: 'Contact Alex\nFollow up next week',
  };

  await t.test('navigation, empty state, and application form are accessible without Gmail', async () => {
    assert.match(await (await get('/')).text(), /href="\/jobs"/);
    assert.match(await (await get('/jobs')).text(), /No applications yet/);
    const html = await (await get('/jobs/new')).text();
    for (const field of Object.keys(application)) assert.ok(html.includes(`name="${field}"`));
  });

  await t.test('create, list, and edit preserve application fields and escape user text', async () => {
    assert.equal((await post('/jobs', application)).status, 302);
    let html = await (await get('/jobs')).text();
    assert.match(html, /Acme &amp; Co/);
    assert.match(html, /Frontend Developer/);
    assert.match(html, /2026-09-09/);
    const edited = { ...application, role: 'Senior Developer', notes: '<script>alert(1)</script>\nInterview Monday' };
    assert.equal((await post('/jobs/1/update', edited)).status, 302);
    html = await (await get('/jobs/1/edit')).text();
    assert.match(html, /Senior Developer/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.equal(db.prepare('SELECT notes FROM job_applications WHERE id=1').get().notes, edited.notes);
  });

  await t.test('invalid input is rejected without losing entered fields or changing saved data', async () => {
    for (const change of [
      { company: ' ' }, { role: '' }, { applied_on: '2026-02-30' }, { applied_on: '' },
      { job_url: 'javascript:alert(1)' }, { job_url: 'not a url' }, { status: 'sent' }, { status: 'constructor' },
    ]) {
      const response = await post('/jobs', { ...application, ...change });
      assert.equal(response.status, 400, JSON.stringify(change));
      assert.match(await response.text(), /role="alert"/);
    }
    assert.equal((await post('/jobs/1/update', { ...application, applied_on: 'bad' })).status, 400);
    assert.equal(db.prepare('SELECT role FROM job_applications WHERE id=1').get().role, 'Senior Developer');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM job_applications').get().n, 1);
  });

  await t.test('status updates, search, filters, and pagination work together', async () => {
    const response = await post('/jobs/1/status', { status: 'interviewing', return_to: '/jobs?q=Acme&status=applied&page=1' });
    assert.equal(response.headers.get('location'), '/jobs?q=Acme&status=applied&page=1');
    assert.equal((await post('/jobs/1/status', { status: 'invalid' })).status, 400);
    assert.equal(db.prepare('SELECT status FROM job_applications WHERE id=1').get().status, 'interviewing');
    assert.match(await (await get('/jobs?q=Senior&status=interviewing')).text(), /Acme &amp; Co/);
    assert.match(await (await get('/jobs?q=Senior&status=rejected')).text(), /No applications match/);
    for (let i = 0; i < 11; i++) {
      assert.equal((await post('/jobs', { ...application, company: `Other Company ${i}` })).status, 302);
    }
    const firstPage = await (await get('/jobs?q=Other&status=applied')).text();
    assert.match(firstPage, /11 applications &middot; Page 1 of 2/);
    assert.match(firstPage, /q=Other&amp;status=applied&amp;page=2/);
    assert.match(await (await get('/jobs?q=Other&status=applied&page=2')).text(), /Other Company 0/);
    assert.match(await (await get('/jobs?page=999999')).text(), /Page 2 of 2/);
    assert.equal((await post('/jobs/1/status', { status: 'offer', return_to: 'https://example.com' })).headers.get('location'), '/jobs');
  });

  await t.test('missing applications return 404 and deletion removes only the selected application', async () => {
    assert.equal((await get('/jobs/9999/edit')).status, 404);
    assert.equal((await get('/jobs/not-an-id/edit')).status, 404);
    for (const action of ['update', 'status', 'delete']) assert.equal((await post(`/jobs/9999/${action}`, application)).status, 404);
    assert.equal((await post('/jobs/1/delete')).status, 302);
    assert.equal((await get('/jobs/1/edit')).status, 404);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM job_applications').get().n, 11);
    assert.equal(db.prepare('SELECT business_name FROM leads').get().business_name, 'Existing lead');
    assert.equal(db.prepare('SELECT name FROM templates').get().name, 'Existing template');
  });

  await t.test('applications remain in SQLite after the app and database close', async () => {
    await new Promise(resolve => server.close(resolve));
    server = null;
    db.close();
    const reopened = new Database(path.join(directory, 'data.db'), { readonly: true });
    try {
      assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM job_applications').get().n, 11);
      assert.equal(reopened.prepare('SELECT job_url FROM job_applications LIMIT 1').get().job_url, application.job_url);
    } finally { reopened.close(); }
  });
});
