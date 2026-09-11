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
    // Simulate an existing installation before the optional source field was added.
    db.exec('ALTER TABLE job_applications DROP COLUMN source');
    db.prepare("INSERT INTO job_applications (id, company, role, applied_on) VALUES (-1, 'Legacy company', 'Developer', '2026-09-01')").run();
    db.close();
    delete require.cache[require.resolve('../db')];
    db = require('../db');
    assert.deepEqual(db.prepare('SELECT company, source FROM job_applications WHERE id=-1').get(), { company: 'Legacy company', source: null });
    db.prepare("INSERT INTO job_websites (id, name, url) VALUES (-1, 'LinkedIn', '')").run();
    db.prepare("UPDATE job_applications SET source=' linkedin ' WHERE id=-1").run();
    db.exec('ALTER TABLE job_applications DROP COLUMN website_id');
    db.close();
    delete require.cache[require.resolve('../db')];
    db = require('../db');
    assert.equal(db.prepare('SELECT website_id FROM job_applications WHERE id=-1').get().website_id, -1);
    db.prepare('DELETE FROM job_applications WHERE id=-1').run();
    db.prepare('DELETE FROM job_websites WHERE id=-1').run();
    // The migration also remains safe on subsequent starts.
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
  const getWebsites = async (q = '') => (await (await get('/job-websites?format=json&q=' + encodeURIComponent(q))).json()).websites;
  const postJson = (url, data = {}) => fetch(base + url, {
    method: 'POST', redirect: 'manual', headers: { Accept: 'application/json' }, body: new URLSearchParams(data),
  });
  const post = (url, data = {}) => fetch(base + url, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams(data),
  });
  const application = {
    company: 'Acme & Co', role: 'Frontend Developer', applied_on: '2026-09-09',
    website_id: '1', job_url: 'https://example.com/jobs/123', status: 'applied', notes: 'Contact Alex\nFollow up next week',
  };

  await t.test('navigation, empty state, and application form are accessible without Gmail', async () => {
    assert.match(await (await get('/')).text(), /href="\/jobs"/);
    assert.match(await (await get('/jobs')).text(), /No applications yet/);
    const html = await (await get('/jobs/new')).text();
    assert.match(html, /No websites saved yet/);
    assert.doesNotMatch(html, /name="source"|<datalist/);
    for (const field of Object.keys(application)) assert.ok(html.includes(`name="${field}"`));
    assert.equal((await post('/job-websites', { name: 'LinkedIn' })).status, 302);
    assert.match(await (await get('/jobs/new')).text(), /<option value="1"[^>]*>LinkedIn<\/option>/);
  });

  await t.test('create, list, and edit preserve application fields and escape user text', async () => {
    assert.equal((await post('/jobs', application)).status, 302);
    let html = await (await get('/jobs')).text();
    assert.match(html, /Acme &amp; Co/);
    assert.match(html, /Frontend Developer/);
    assert.match(html, /2026-09-09/);
    assert.match(html, /Found on: LinkedIn/);
    const edited = { ...application, role: 'Senior Developer', notes: '<script>alert(1)</script>\nInterview Monday' };
    assert.equal((await post('/jobs/1/update', edited)).status, 302);
    html = await (await get('/jobs/1/edit')).text();
    assert.match(html, /Senior Developer/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.equal(db.prepare('SELECT notes FROM job_applications WHERE id=1').get().notes, edited.notes);
    assert.match(html, /value="1" selected>LinkedIn/);
    assert.equal(db.prepare('SELECT website_id FROM job_applications WHERE id=1').get().website_id, 1);
  });

  await t.test('linked websites reflect renames, preserve history on deletion, and can be cleared', async () => {
    assert.equal((await post('/job-websites', { name: 'Local Jobs' })).status, 302);
    const edited = { ...application, role: 'Senior Developer', website_id: '2' };
    assert.equal((await post('/jobs/1/update', edited)).status, 302);
    assert.equal((await post('/job-websites/2/update', { name: 'Local Jobs & <Community>' })).status, 302);
    const html = await (await get('/jobs?q=Community&status=applied')).text();
    assert.match(html, /Acme &amp; Co/);
    assert.match(html, /Found on: Local Jobs &amp; &lt;Community&gt;/);
    assert.match(await (await get('/jobs/1/edit')).text(), /value="2" selected>Local Jobs &amp; &lt;Community&gt;/);
    assert.equal((await post('/job-websites/2/delete')).status, 302);
    assert.deepEqual(db.prepare('SELECT website_id, source FROM job_applications WHERE id=1').get(), { website_id: null, source: 'Local Jobs & <Community>' });
    assert.match(await (await get('/jobs/1/edit')).text(), /value="legacy" selected/);
    assert.equal((await post('/jobs/1/update', { ...edited, website_id: 'legacy' })).status, 302);
    assert.match(await (await get('/jobs?q=Community')).text(), /Found on: Local Jobs &amp; &lt;Community&gt;/);
    assert.equal((await post('/jobs/1/update', { ...edited, website_id: '' })).status, 302);
    assert.equal(db.prepare('SELECT source FROM job_applications WHERE id=1').get().source, null);
    const { website_id, ...withoutSource } = edited;
    assert.equal((await post('/jobs', withoutSource)).status, 302);
    const optionalJob = db.prepare('SELECT id, source FROM job_applications ORDER BY id DESC LIMIT 1').get();
    assert.equal(optionalJob.source, null);
    assert.equal((await post(`/jobs/${optionalJob.id}/delete`)).status, 302);
  });

  await t.test('invalid input is rejected without losing entered fields or changing saved data', async () => {
    for (const change of [
      { company: ' ' }, { role: '' }, { applied_on: '2026-02-30' }, { applied_on: '' },
      { job_url: 'javascript:alert(1)' }, { job_url: 'not a url' }, { status: 'sent' }, { status: 'constructor' },
      { website_id: '999999' }, { website_id: 'LinkedIn' }, { website_id: 'legacy' },
    ]) {
      const response = await post('/jobs', { ...application, ...change });
      assert.equal(response.status, 400, JSON.stringify(change));
      assert.match(await response.text(), /role="alert"/);
    }
    assert.equal((await post('/jobs/1/update', { ...application, applied_on: 'bad' })).status, 400);
    assert.equal(db.prepare('SELECT role FROM job_applications WHERE id=1').get().role, 'Senior Developer');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM job_applications').get().n, 1);
    const invalid = await post('/jobs', { ...application, company: '' });
    assert.match(await invalid.text(), /value="1" selected>LinkedIn/);
    assert.throws(() => db.prepare('UPDATE job_applications SET website_id=999999 WHERE id=1').run(), /FOREIGN KEY/);
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

  let keptWebsiteId;
  await t.test('saved websites can be created, searched, edited, and deleted independently of applications', async () => {
    const jobsPage = await (await get('/jobs')).text();
    assert.match(jobsPage, /Job Applications<\/h1>\s*<button[^>]*data-open-websites/);
    assert.doesNotMatch(jobsPage.match(/<nav[\s\S]*?<\/nav>/)[0], /Job Websites/);
    assert.match(jobsPage, /<dialog id="job-websites-dialog" aria-labelledby="websites-title"/);
    assert.match(jobsPage, /id="websites-close"/);
    assert.equal((await getWebsites())[0].name, 'LinkedIn');
    const newForm = await (await get('/job-websites/new')).text();
    assert.match(newForm, /name="name"/);
    assert.doesNotMatch(newForm, /name="(?:url|notes)"/);
    const website = { name: ' Local Careers ' };
    assert.equal((await postJson('/job-websites', website)).status, 200);
    const websiteId = db.prepare('SELECT id FROM job_websites WHERE name=?').get('Local Careers').id;
    assert.ok((await getWebsites()).some(item => item.name === 'Local Careers'));
    assert.equal(db.prepare('SELECT name FROM job_websites WHERE id=?').get(websiteId).name, 'Local Careers');
    for (const term of ['Local', 'Careers']) {
      assert.ok((await getWebsites(term)).some(item => item.name === 'Local Careers'));
    }
    assert.deepEqual(await getWebsites('no-match'), []);
    // Existing links and notes survive edits made with the simplified form.
    db.prepare('UPDATE job_websites SET url=?, notes=? WHERE id=?').run('https://example.com/careers', 'Check weekly', websiteId);
    const edited = { name: 'Jobs & <Careers>' };
    assert.equal((await postJson(`/job-websites/${websiteId}/update`, edited)).status, 200);
    const oldEditPage = await fetch(base + `/job-websites/${websiteId}/edit`, { redirect: 'manual' });
    assert.equal(oldEditPage.headers.get('location'), `/jobs?websites=1&edit_website=${websiteId}`);
    assert.deepEqual(db.prepare('SELECT url, notes FROM job_websites WHERE id=?').get(websiteId), { url: 'https://example.com/careers', notes: 'Check weekly' });
    assert.ok((await getWebsites()).some(item => item.name === edited.name));
    assert.equal((await post('/job-websites', { name: 'Keep this site' })).status, 302);
    keptWebsiteId = db.prepare('SELECT id FROM job_websites WHERE name=?').get('Keep this site').id;
    assert.equal((await postJson(`/job-websites/${websiteId}/delete`)).status, 200);
    assert.equal((await get(`/job-websites/${websiteId}/edit`)).status, 404);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM job_websites').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM job_applications').get().n, 11);
  });

  await t.test('saved websites reject invalid names and preserve data on validation errors', async () => {
    const website = { name: 'Keep this site' };
    for (const change of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(201) }]) {
      const response = await postJson('/job-websites', { ...website, ...change });
      assert.equal(response.status, 400, JSON.stringify(change).slice(0, 100));
      assert.match((await response.json()).error, /Website name/);
    }
    const response = await post(`/job-websites/${keptWebsiteId}/update`, { name: 'x'.repeat(201) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /200 characters/);
    assert.equal(db.prepare('SELECT name FROM job_websites WHERE id=?').get(keptWebsiteId).name, website.name);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM job_websites').get().n, 2);
    assert.equal((await get('/job-websites/not-an-id/edit')).status, 404);
    for (const action of ['update', 'delete']) assert.equal((await post(`/job-websites/9999/${action}`, website)).status, 404);
  });

  await t.test('applications and saved websites remain in SQLite after the app and database close', async () => {
    await new Promise(resolve => server.close(resolve));
    server = null;
    db.close();
    const reopened = new Database(path.join(directory, 'data.db'), { readonly: true });
    try {
      assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM job_applications').get().n, 11);
      assert.equal(reopened.prepare('SELECT job_url FROM job_applications LIMIT 1').get().job_url, application.job_url);
      assert.equal(reopened.prepare('SELECT website_id FROM job_applications LIMIT 1').get().website_id, Number(application.website_id));
      assert.deepEqual(reopened.prepare('SELECT name, url, notes FROM job_websites ORDER BY id').all(), [{ name: 'LinkedIn', url: '', notes: null }, { name: 'Keep this site', url: '', notes: null }]);
    } finally { reopened.close(); }
  });
});
