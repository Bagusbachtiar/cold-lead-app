const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const Database = require('better-sqlite3');

async function smoke() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coldreach-window-'));
  const root = path.resolve(__dirname, '..');
  const executablePath = path.join(root, 'dist', `ColdReach-win32-${process.arch}`, 'ColdReach.exe');
  const appDirectory = path.join(path.dirname(executablePath), 'resources', 'app');
  for (const privateFile of ['data.db', '.env', 'backups', '.git']) assert.equal(fs.existsSync(path.join(appDirectory, privateFile)), false, `${privateFile} must not be bundled`);
  let desktop;
  try {
    desktop = await electron.launch({
      executablePath, timeout: 60000,
      env: { ...process.env, COLDREACH_DATA_DIR: directory, COLDREACH_USER_DATA_DIR: path.join(directory, 'profile'), COLDREACH_PORT: '0', COLDREACH_TEST: '1' },
    });
    const page = await desktop.firstWindow();
    await page.waitForURL(/127\.0\.0\.1/);
    await page.locator('h1').filter({ hasText: 'Dashboard' }).waitFor();
    const origin = new URL(page.url()).origin;
    await page.getByRole('link', { name: 'Jobs', exact: true }).click();
    await page.getByRole('button', { name: 'Job Websites', exact: true }).click();
    await page.locator('#website-name').fill('Desktop smoke website');
    await page.getByRole('button', { name: 'Add Website', exact: true }).click();
    await page.locator('#website-list').getByText('Desktop smoke website').waitFor();
    // Exercise the modal with enough saved websites to require scrolling.
    await page.evaluate(async () => {
      const names = ['zebra', 'alpha', 'Beta', ...Array.from({ length: 20 }, (_, i) => `Website ${String(i).padStart(2, '0')}`)];
      for (const name of names.reverse()) {
        const response = await fetch('/job-websites', { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams({ name }) });
        if (!response.ok) throw new Error('Could not seed modal test websites');
      }
    });
    await page.getByRole('button', { name: 'Close Job Websites' }).click();
    await page.getByRole('button', { name: 'Job Websites', exact: true }).click();
    await page.locator('#website-list').getByText('alpha', { exact: true }).waitFor();
    assert.equal(await page.locator('#website-search').count(), 0);
    const names = await page.locator('#website-list li > span').allTextContents();
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    const scrolling = await page.locator('#website-list').evaluate(list => {
      list.scrollTop = list.scrollHeight;
      return { overflow: getComputedStyle(list).overflowY, scrolled: list.scrollTop > 0 };
    });
    assert.equal(scrolling.overflow, 'auto');
    assert.equal(scrolling.scrolled, true);
    await page.getByRole('button', { name: 'Close Job Websites' }).click();
    await page.getByRole('link', { name: '+ Add Application' }).click();
    await page.locator('#company').fill('Desktop smoke company');
    await page.locator('#role').fill('Developer');
    await page.locator('#website_id').selectOption({ label: 'Desktop smoke website' });
    await page.getByRole('button', { name: 'Save Application', exact: true }).click();
    await page.getByText('Desktop smoke company', { exact: true }).waitFor();
    console.log('Packaged UI saved a website and linked application. Checking window-close shutdown...');
    // Close the real BrowserWindow, rather than terminating it through the test runner.
    const child = desktop.process();
    const exited = once(child, 'exit');
    await desktop.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 50); });
    const [code] = await exited;
    assert.equal(code, 0);
    desktop = null;
    await assert.rejects(fetch(origin));
    const db = new Database(path.join(directory, 'data.db'), { readonly: true });
    try {
      assert.equal(db.prepare('SELECT company FROM job_applications').get().company, 'Desktop smoke company');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM job_websites').get().n, 24);
    } finally { db.close(); }
    console.log('Desktop smoke passed: modal has no search, websites sort A-Z and scroll, application saved, window closed, server stopped, database persisted.');
  } finally {
    if (desktop) await desktop.close();
    // Chromium may release profile files shortly after process exit; keep test files if still locked.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('coldreach-window-'));
    try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { console.log(`Temporary smoke-test data retained at ${directory}`); }
  }
}
smoke().catch(error => { console.error(error); process.exitCode = 1; });
