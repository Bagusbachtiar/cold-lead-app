// Job applications are recorded manually and kept separate from outreach leads.
module.exports = function registerJobs(app, db, { layout, esc, INPUT, LABEL, BTN, BTN_SM, BTN_GHOST, CARD }) {
  const statuses = {
    applied: 'Applied',
    interviewing: 'Interviewing',
    offer: 'Offer',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn',
  };
  const colors = {
    applied: 'text-blue-400', interviewing: 'text-orange-400', offer: 'text-green-400',
    rejected: 'text-red-400', withdrawn: 'text-gray-400',
  };
  const validStatus = value => Object.hasOwn(statuses, value);
  const string = value => typeof value === 'string' ? value.trim() : '';
  const options = selected => Object.entries(statuses).map(([value, label]) =>
    `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  const findJob = id => /^\d+$/.test(id) ? db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id) : null;
  const notFound = res => res.status(404).send(layout('Not Found', '<p class="text-gray-400">Application not found.</p>', { back: { href: '/jobs', label: 'Jobs' } }));

  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function form(job = {}, error = '') {
    const editing = !!job.id;
    return layout(editing ? 'Edit Application' : 'Add Application', `
      <div class="${CARD} p-6 max-w-xl">
        <p class="text-sm text-gray-400">Record a job you applied to and keep track of what happens next.</p>
        ${error ? `<p role="alert" class="mt-4 text-sm text-red-400">${esc(error)}</p>` : ''}
        <form method="POST" action="${editing ? `/jobs/${job.id}/update` : '/jobs'}">
          <label for="company" class="${LABEL}">Company <span class="text-red-400">*</span></label>
          <input id="company" name="company" class="${INPUT}" value="${esc(job.company || '')}" placeholder="e.g. Acme" maxlength="200" required autofocus>
          <label for="role" class="${LABEL}">Job title <span class="text-red-400">*</span></label>
          <input id="role" name="role" class="${INPUT}" value="${esc(job.role || '')}" placeholder="e.g. Frontend Developer" maxlength="200" required>
          <label for="applied_on" class="${LABEL}">Date applied <span class="text-red-400">*</span></label>
          <input id="applied_on" name="applied_on" type="date" class="${INPUT}" value="${esc(job.applied_on ?? today())}" required>
          <label for="source" class="${LABEL}">Found on <span class="text-gray-600">(optional)</span></label>
          <input id="source" name="source" list="job-sources" class="${INPUT}" value="${esc(job.source || '')}" placeholder="e.g. LinkedIn, Indeed, or another website" maxlength="200" aria-describedby="source-help">
          <datalist id="job-sources">
            <option value="LinkedIn"></option>
            <option value="Indeed"></option>
            <option value="Glassdoor"></option>
            <option value="JobStreet"></option>
            <option value="Company website"></option>
          </datalist>
          <p id="source-help" class="text-xs text-gray-400 mt-1">Choose a suggestion or type any website name.</p>
          <label for="job_url" class="${LABEL}">Job posting link <span class="text-gray-600">(optional)</span></label>
          <input id="job_url" name="job_url" type="url" class="${INPUT}" value="${esc(job.job_url || '')}" placeholder="https://..." maxlength="2000">
          <label for="status" class="${LABEL}">Status</label>
          <select id="status" name="status" class="${INPUT}">${options(job.status || 'applied')}</select>
          <label for="notes" class="${LABEL}">Notes</label>
          <textarea id="notes" name="notes" rows="5" maxlength="10000" class="${INPUT}" placeholder="Recruiter contact, salary, interview details, or next steps...">${esc(job.notes || '')}</textarea>
          <div class="flex items-center gap-4 mt-6">
            <button type="submit" class="${BTN}">${editing ? 'Save Changes' : 'Save Application'}</button>
            <a href="/jobs" class="${BTN_GHOST}">Cancel</a>
          </div>
        </form>
      </div>`, { back: { href: '/jobs', label: 'Jobs' } });
  }

  function validate(body) {
    const job = Object.fromEntries(['company', 'role', 'applied_on', 'source', 'job_url', 'status', 'notes'].map(key => [key, string(body[key])]));
    let error = '';
    if (!job.company || !job.role) error = 'Company and job title are required.';
    else if (job.company.length > 200 || job.role.length > 200) error = 'Company and job title must be 200 characters or fewer.';
    else if (job.source.length > 200) error = 'Website name must be 200 characters or fewer.';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(job.applied_on) || !Number.isFinite(Date.parse(job.applied_on)) || new Date(job.applied_on).toISOString().slice(0, 10) !== job.applied_on) error = 'Enter a valid application date.';
    else if (!validStatus(job.status)) error = 'Choose a valid application status.';
    else if (job.notes.length > 10000) error = 'Notes must be 10,000 characters or fewer.';
    else if (job.job_url) {
      try {
        const url = new URL(job.job_url);
        if (!['http:', 'https:'].includes(url.protocol) || job.job_url.length > 2000) throw new Error();
      } catch {
        error = 'Enter a valid job link starting with http:// or https://.';
      }
    }
    return { job, error };
  }

  app.get('/jobs', (req, res) => {
    const search = string(req.query.q);
    const status = validStatus(string(req.query.status)) ? string(req.query.status) : '';
    const conditions = [], params = [];
    if (search) {
      conditions.push('(company LIKE ? OR role LIKE ? OR source LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { conditions.push('status = ?'); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS n FROM job_applications ${where}`).get(...params).n;
    const pages = Math.max(1, Math.ceil(total / 10));
    const page = Math.min(pages, Math.max(1, parseInt(string(req.query.page), 10) || 1));
    const jobs = db.prepare(`SELECT * FROM job_applications ${where} ORDER BY applied_on DESC, id DESC LIMIT 10 OFFSET ?`).all(...params, (page - 1) * 10);
    const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM job_applications GROUP BY status').all().map(row => [row.status, row.n]));
    const allCount = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const pageUrl = p => `/jobs?${new URLSearchParams({ q: search, status, page: String(p) })}`;
    const returnTo = pageUrl(page);
    const cards = [['', 'All', allCount], ...Object.entries(statuses).map(([key, label]) => [key, label, counts[key] || 0])].map(([key, label, count]) => `
      <a href="/jobs?${esc(new URLSearchParams({ q: search, status: key }).toString())}" class="${CARD} p-4 ${status === key ? 'ring-2 ring-blue-500' : 'hover:border-gray-600'}">
        <div class="text-2xl font-bold ${colors[key] || 'text-white'}">${count}</div>
        <div class="text-xs text-gray-400 mt-1">${label}</div>
      </a>`).join('');
    const rows = jobs.map(job => `
      <tr class="align-top hover:bg-gray-800/50">
        <td class="px-4 py-4">
          <a href="/jobs/${job.id}/edit" class="text-blue-400 font-semibold break-words">${esc(job.company)}</a>
          <div class="text-gray-300 mt-1 break-words">${esc(job.role)}</div>
          ${job.source ? `<div class="text-xs text-gray-400 mt-2 break-words">Found on: ${esc(job.source)}</div>` : ''}
          ${job.job_url ? `<a href="${esc(job.job_url)}" target="_blank" rel="noopener noreferrer" class="inline-block mt-2 text-xs text-gray-400 hover:text-white underline">View job posting &#8599;</a>` : ''}
        </td>
        <td class="px-4 py-4 whitespace-nowrap text-gray-400">${esc(job.applied_on)}</td>
        <td class="px-4 py-4">
          <form method="POST" action="/jobs/${job.id}/status" class="flex flex-wrap gap-2">
            <input type="hidden" name="return_to" value="${esc(returnTo)}">
            <select name="status" aria-label="Status for ${esc(job.company)} ${esc(job.role)}" class="bg-gray-800 border border-gray-700 rounded px-2 py-1 ${colors[job.status]}">${options(job.status)}</select>
            <button type="submit" class="text-xs text-blue-400 hover:text-blue-300">Update</button>
          </form>
        </td>
        <td class="px-4 py-4 text-gray-400">
          ${job.notes ? `<details><summary class="cursor-pointer text-yellow-400">View notes</summary><p class="mt-2 whitespace-pre-wrap break-words max-w-xs">${esc(job.notes)}</p></details>` : '<span class="text-gray-600">No notes</span>'}
        </td>
        <td class="px-4 py-4">
          <a href="/jobs/${job.id}/edit" class="text-blue-400">Edit</a>
          <form method="POST" action="/jobs/${job.id}/delete" onsubmit="return confirm('Delete this application?')" class="mt-2">
            <button type="submit" class="text-xs text-red-400">Delete</button>
          </form>
        </td>
      </tr>`).join('');

    res.send(layout('Job Applications', `
      <p class="text-sm text-gray-400 mb-6">Your application history, from first application to offer.</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">${cards}</div>
      <div class="${CARD} overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-gray-800">
          <form method="GET" action="/jobs" class="flex flex-wrap items-center gap-2">
            <input type="hidden" name="status" value="${esc(status)}">
            <input name="q" type="search" aria-label="Search company, job title, or website" value="${esc(search)}" placeholder="Search company, role, website..." class="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-60 max-w-full">
            <button type="submit" class="${BTN_SM}">Search</button>
            ${search || status ? `<a href="/jobs" class="${BTN_GHOST}">Clear</a>` : ''}
          </form>
          <a href="/jobs/new" class="${BTN_SM}">+ Add Application</a>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-800/50 text-xs text-gray-400 uppercase"><tr>
              <th scope="col" class="px-4 py-3 text-left">Company / Role</th>
              <th scope="col" class="px-4 py-3 text-left">Applied</th>
              <th scope="col" class="px-4 py-3 text-left">Status</th>
              <th scope="col" class="px-4 py-3 text-left">Notes</th>
              <th scope="col" class="px-4 py-3 text-left">Actions</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-800">${rows || `<tr><td colspan="5" class="p-10 text-center text-gray-400">${search || status ? 'No applications match your search or filter.' : 'No applications yet. Add a job you have already applied to.'}</td></tr>`}</tbody>
          </table>
        </div>
        <div class="flex items-center gap-4 px-4 py-3 border-t border-gray-800 text-xs text-gray-400">
          <span>${total} application${total === 1 ? '' : 's'} &middot; Page ${page} of ${pages}</span>
          ${page > 1 ? `<a href="${esc(pageUrl(page - 1))}" class="text-blue-400">Previous</a>` : ''}
          ${page < pages ? `<a href="${esc(pageUrl(page + 1))}" class="text-blue-400">Next</a>` : ''}
        </div>
      </div>`));
  });

  app.get('/jobs/new', (req, res) => res.send(form()));

  app.post('/jobs', (req, res) => {
    const { job, error } = validate(req.body);
    if (error) return res.status(400).send(form(job, error));
    db.prepare('INSERT INTO job_applications (company, role, applied_on, source, job_url, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(job.company, job.role, job.applied_on, job.source || null, job.job_url || null, job.status, job.notes || null);
    res.redirect('/jobs');
  });

  app.get('/jobs/:id/edit', (req, res) => {
    const job = findJob(req.params.id);
    return job ? res.send(form(job)) : notFound(res);
  });

  app.post('/jobs/:id/update', (req, res) => {
    if (!findJob(req.params.id)) return notFound(res);
    const { job, error } = validate(req.body);
    if (error) return res.status(400).send(form({ ...job, id: req.params.id }, error));
    db.prepare('UPDATE job_applications SET company=?, role=?, applied_on=?, source=?, job_url=?, status=?, notes=? WHERE id=?')
      .run(job.company, job.role, job.applied_on, job.source || null, job.job_url || null, job.status, job.notes || null, req.params.id);
    res.redirect('/jobs');
  });

  app.post('/jobs/:id/status', (req, res) => {
    if (!findJob(req.params.id)) return notFound(res);
    if (!validStatus(string(req.body.status))) return res.status(400).send(layout('Invalid Status', '<p class="text-red-400">Choose a valid application status.</p>', { back: { href: '/jobs', label: 'Jobs' } }));
    db.prepare('UPDATE job_applications SET status=? WHERE id=?').run(req.body.status.trim(), req.params.id);
    const returnTo = string(req.body.return_to);
    res.redirect(returnTo.startsWith('/jobs?') ? returnTo : '/jobs');
  });

  app.post('/jobs/:id/delete', (req, res) => {
    if (!findJob(req.params.id)) return notFound(res);
    db.prepare('DELETE FROM job_applications WHERE id=?').run(req.params.id);
    res.redirect('/jobs');
  });
};
