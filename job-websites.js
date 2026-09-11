module.exports = function registerJobWebsites(app, db, { INPUT, LABEL, BTN, BTN_SM, BTN_GHOST }) {
  const string = value => typeof value === 'string' ? value.trim() : '';
  const findWebsite = id => /^\d+$/.test(id) ? db.prepare('SELECT * FROM job_websites WHERE id = ?').get(id) : null;
  const notFound = res => res.status(404).json({ error: 'Website not found.' });
  const saved = (req, res) => req.get('Accept') === 'application/json' ? res.json({ ok: true }) : res.redirect('/jobs?websites=1');

  function validate(body) {
    const name = string(body.name);
    const error = !name ? 'Website name is required.' : name.length > 200 ? 'Website name must be 200 characters or fewer.' : '';
    return { name, error };
  }

  app.get('/job-websites-client.js', (req, res) => res.sendFile(__dirname + '/job-websites-client.js'));
  app.get('/job-websites', (req, res) => {
    if (req.query.format !== 'json') return res.redirect('/jobs?websites=1');
    const search = string(req.query.q);
    const websites = search
      ? db.prepare('SELECT id, name FROM job_websites WHERE name LIKE ? ORDER BY name COLLATE NOCASE, id').all(`%${search}%`)
      : db.prepare('SELECT id, name FROM job_websites ORDER BY name COLLATE NOCASE, id').all();
    res.json({ websites });
  });
  app.get('/job-websites/new', (req, res) => res.redirect('/jobs?websites=1'));
  app.get('/job-websites/:id/edit', (req, res) => {
    const website = findWebsite(req.params.id);
    return website ? res.redirect(`/jobs?websites=1&edit_website=${website.id}`) : notFound(res);
  });
  app.post('/job-websites', (req, res) => {
    const { name, error } = validate(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare("INSERT INTO job_websites (name, url) VALUES (?, '')").run(name);
    saved(req, res);
  });
  app.post('/job-websites/:id/update', (req, res) => {
    if (!findWebsite(req.params.id)) return notFound(res);
    const { name, error } = validate(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare('UPDATE job_websites SET name=? WHERE id=?').run(name, req.params.id);
    saved(req, res);
  });
  app.post('/job-websites/:id/delete', (req, res) => {
    const website = findWebsite(req.params.id);
    if (!website) return notFound(res);
    db.transaction(() => {
      db.prepare('UPDATE job_applications SET source=? WHERE website_id=?').run(website.name, website.id);
      db.prepare('DELETE FROM job_websites WHERE id=?').run(website.id);
    })();
    saved(req, res);
  });

  return function websiteModal() {
    return `
      <dialog id="job-websites-dialog" aria-labelledby="websites-title" class="bg-gray-900 text-gray-100 border border-gray-700 rounded-lg p-0 w-full max-w-xl max-h-[85vh] overflow-hidden backdrop:bg-black/70">
        <div class="p-6 flex flex-col max-h-[80vh]">
          <div class="flex items-center justify-between gap-4 mb-4 shrink-0">
            <h2 id="websites-title" class="text-xl font-bold">Job Websites</h2>
            <button type="button" id="websites-close" class="${BTN_GHOST}" aria-label="Close Job Websites">Close &#215;</button>
          </div>
          <p class="text-sm text-gray-400 shrink-0">Save the website names you check for jobs.</p>
          <p id="websites-error" role="alert" class="text-sm text-red-400 mt-3 shrink-0" hidden></p>
          <form id="website-form" class="mb-6 shrink-0">
            <label for="website-name" class="${LABEL}">Website name</label>
            <input id="website-name" name="name" class="${INPUT}" placeholder="e.g. LinkedIn or Indeed" maxlength="200" required>
            <div class="flex items-center gap-4 mt-3">
              <button id="website-save" type="submit" class="${BTN}">Add Website</button>
              <button id="website-cancel" type="button" class="${BTN_GHOST}" hidden>Cancel Edit</button>
            </div>
          </form>
          <p id="website-count" role="status" class="text-xs text-gray-400 my-3 shrink-0"></p>
          <ul id="website-list" tabindex="0" aria-label="Saved websites, sorted A to Z" class="divide-y divide-gray-800 min-h-0 max-h-[40vh] overflow-y-auto overscroll-contain pr-2"></ul>
        </div>
      </dialog>
      <script defer src="/job-websites-client.js"></script>`;
  };
};
