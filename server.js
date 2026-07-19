const express = require('express');
const db = require('./db');

const app = express();
app.use(express.urlencoded({ extended: false }));

const INPUT    = 'w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mt-1 block';
const LABEL    = 'block text-sm font-medium text-gray-400 mt-4';
const BTN      = 'inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors';
const BTN_SM   = 'inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors';
const BTN_GHOST = 'text-sm text-gray-500 hover:text-gray-200 font-medium transition-colors';
const CARD     = 'bg-gray-900 border border-gray-800 rounded-lg shadow-sm';

function badge(status) {
  const cls = {
    sent_gmail: 'bg-blue-900/60 text-blue-400',
    sent_wa:    'bg-green-900/60 text-green-400',
  }[status] || 'bg-gray-800 text-gray-300';
  const label = { sent_gmail: 'Gmail', sent_wa: 'WhatsApp' }[status] || status;
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}">${label}</span>`;
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function layout(title, body, { back } = {}) {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — ColdReach</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <style> [x-cloak] { display: none; } </style>
</head>
<body class="bg-gray-950 min-h-screen text-gray-100">

  <nav class="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-8">
    <a href="/" class="font-bold text-sm tracking-widest uppercase text-white">ColdReach</a>
    <div class="flex gap-6 text-sm">
      <a href="/"              class="text-gray-500 hover:text-white transition-colors">Dashboard</a>
      <a href="/leads/new"     class="text-gray-500 hover:text-white transition-colors">+ Lead</a>
      <a href="/templates"     class="text-gray-500 hover:text-white transition-colors">Templates</a>
    </div>
  </nav>

  <main class="max-w-4xl mx-auto px-6 py-10">
    ${back ? `<a href="${back.href}" class="inline-flex items-center text-sm text-gray-600 hover:text-gray-300 mb-6 gap-1 transition-colors">&#8592; ${esc(back.label)}</a>` : ''}
    <h1 class="text-2xl font-bold text-white mb-6">${esc(title)}</h1>
    ${body}
  </main>

</body>
</html>`;
}

// ---- DASHBOARD ----
app.get('/', (req, res) => {
  const { status } = req.query;
  const leads = status
    ? db.prepare('SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();

  const counts = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(status='sent_gmail') as sent_gmail,
      SUM(status='sent_wa') as sent_wa
    FROM leads
  `).get();

  const stats = [
    { label: 'All',       value: counts.total,      href: '/',                    active: !status,                    color: 'text-white' },
    { label: 'Gmail',     value: counts.sent_gmail,  href: '/?status=sent_gmail',  active: status === 'sent_gmail',    color: 'text-blue-400' },
    { label: 'WhatsApp',  value: counts.sent_wa,     href: '/?status=sent_wa',     active: status === 'sent_wa',       color: 'text-green-400' },
  ].map(s => `
    <a href="${s.href}" class="${CARD} p-4 hover:border-gray-600 transition-all ${s.active ? 'ring-2 ring-blue-500 border-blue-500' : ''}">
      <div class="text-3xl font-bold ${s.color}">${s.value ?? 0}</div>
      <div class="text-xs text-gray-600 mt-1 font-medium uppercase tracking-wide">${s.label}</div>
    </a>`).join('');

  const rows = leads.length
    ? leads.map(l => `
      <tr class="hover:bg-gray-800/50 transition-colors">
        <td class="px-5 py-3.5 text-sm font-semibold">
          <a href="/leads/${l.id}" class="text-blue-400 hover:text-blue-300">${esc(l.business_name)}</a>
        </td>
        <td class="px-5 py-3.5 text-sm text-gray-400">${l.email ? esc(l.email) : '<span class="text-gray-700">—</span>'}</td>
        <td class="px-5 py-3.5 text-sm text-gray-400">${l.wa_number ? esc(l.wa_number) : '<span class="text-gray-700">—</span>'}</td>
        <td class="px-5 py-3.5">${badge(l.status)}</td>
        <td class="px-5 py-3.5 text-sm text-gray-600">${l.created_at.slice(0, 10)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="px-5 py-12 text-center text-sm text-gray-600">
         No leads yet. <a href="/leads/new" class="text-blue-400 font-medium">Add your first lead</a>.
       </td></tr>`;

  res.send(layout('Dashboard', `
    <div class="grid grid-cols-3 gap-4 mb-8">${stats}</div>
    <div class="${CARD} overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
        <h2 class="text-sm font-semibold text-gray-300">All Leads</h2>
        <a href="/leads/new" class="${BTN_SM}">+ Add Lead</a>
      </div>
      <table class="w-full">
        <thead class="bg-gray-800/50 border-b border-gray-800">
          <tr class="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <th class="px-5 py-3 text-left">Business</th>
            <th class="px-5 py-3 text-left">Email</th>
            <th class="px-5 py-3 text-left">WhatsApp</th>
            <th class="px-5 py-3 text-left">Status</th>
            <th class="px-5 py-3 text-left">Added</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/60">${rows}</tbody>
      </table>
    </div>
  `));
});

// ---- LEADS ----
app.get('/leads/new', (req, res) => {
  const templates = db.prepare('SELECT id, name FROM templates ORDER BY name').all();
  const templateOpts = templates.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');

  res.send(layout('New Lead', `
    <div class="${CARD} p-6 max-w-xl">
      <form method="GET" action="/preview">
        <label class="${LABEL}">Business Name <span class="text-red-500">*</span></label>
        <input class="${INPUT}" name="business_name" required autofocus placeholder="e.g. Warung Pak Budi">

        <label class="${LABEL}">Email</label>
        <input class="${INPUT}" name="email" type="email" placeholder="owner@business.com">

        <label class="${LABEL}">WhatsApp Number <span class="text-gray-600 font-normal">(optional)</span></label>
        <input class="${INPUT}" name="wa_number" placeholder="+628123456789">

        ${templateOpts ? `
        <label class="${LABEL}">Template</label>
        <select class="${INPUT}" name="template_id">${templateOpts}</select>` : `
        <p class="text-xs text-gray-600 mt-4">No templates yet — <a href="/templates/new" class="text-blue-400">create one first</a>.</p>`}

        <div class="flex items-center gap-4 mt-6">
          <button type="submit" class="${BTN}" ${!templateOpts ? 'disabled' : ''}>Preview</button>
          <a href="/" class="${BTN_GHOST}">Cancel</a>
        </div>
      </form>
    </div>
  `));
});

// Standalone preview — no DB save yet, happens on send
app.get('/preview', (req, res) => {
  const { business_name, email, wa_number, template_id } = req.query;
  if (!business_name || !template_id) return res.redirect('/leads/new');
  const tmpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(template_id);
  if (!tmpl) return res.redirect('/leads/new');

  const merged = tmpl.body.replace(/{business_name}/g, business_name);
  const hiddenFields = `
    <input type="hidden" name="business_name" value="${esc(business_name)}">
    <input type="hidden" name="email"         value="${esc(email || '')}">
    <input type="hidden" name="wa_number"     value="${esc(wa_number || '')}">
    <input type="hidden" name="template_id"   value="${esc(template_id)}">
    <input type="hidden" name="merged"        value="${esc(merged)}">`;

  const waBtn = wa_number
    ? `<form method="POST" action="/send-wa">
        ${hiddenFields}
        <button type="submit" class="inline-flex items-center px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-md transition-colors">
          Send via WhatsApp
        </button>
      </form>`
    : `<span class="text-xs text-gray-600">No WA number — <a href="/leads/new" class="text-blue-400">go back to add one</a></span>`;

  res.send(layout(`Preview — ${esc(business_name)}`, `
    <div class="space-y-4 max-w-2xl">
      <div class="${CARD} px-5 py-4 flex gap-6 text-sm">
        <span class="text-gray-500">To: <span class="text-gray-200">${esc(email || '—')}</span></span>
        <span class="text-gray-500">Template: <span class="text-gray-200">${esc(tmpl.name)}</span></span>
      </div>
      <div class="${CARD} px-5 py-5">
        <pre class="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">${esc(merged)}</pre>
      </div>
      <div class="flex items-center gap-4 flex-wrap">
        <span class="inline-flex items-center px-4 py-2 bg-gray-800 text-gray-500 text-sm font-medium rounded-md cursor-not-allowed">
          Send via Gmail <span class="ml-2 text-xs text-gray-600">(Step 2)</span>
        </span>
        ${waBtn}
      </div>
    </div>
  `, { back: { href: '/leads/new', label: 'New Lead' } }));
});

app.post('/send-wa', (req, res) => {
  const { business_name, email, wa_number, merged } = req.body;
  if (!business_name || !wa_number) return res.redirect('/leads/new');
  db.prepare('INSERT INTO leads (business_name, email, wa_number, status) VALUES (?, ?, ?, ?)')
    .run(business_name, email || null, wa_number, 'sent_wa');
  const digits = wa_number.replace(/\D/g, '');
  const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(merged)}`;
  res.send(layout('Opening WhatsApp…', `
    <div class="${CARD} p-6 max-w-md space-y-4">
      <p class="text-gray-300 text-sm">Lead saved. WhatsApp should open automatically.</p>
      <a href="${waUrl}" target="_blank" rel="noopener"
         class="inline-flex items-center px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-md transition-colors">
        Open WhatsApp manually
      </a>
      <div><a href="/" class="${BTN_GHOST}">Go to Dashboard</a></div>
    </div>
    <script>window.open(${JSON.stringify(waUrl)}, '_blank');</script>
  `));
});

app.get('/leads/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).send(layout('Not Found', '<p class="text-gray-500">Lead not found.</p>'));

  const templates = db.prepare('SELECT id, name FROM templates ORDER BY name').all();

  const templatePicker = templates.length
    ? `<div class="${CARD} p-5">
        <form method="GET" action="/leads/${lead.id}/preview">
          <label class="${LABEL}">Choose Template</label>
          <select name="template_id" class="${INPUT}">
            ${templates.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
          </select>
          <button type="submit" class="mt-3 ${BTN}">Generate Preview</button>
        </form>
      </div>`
    : `<div class="${CARD} p-5"><p class="text-sm text-gray-600">No templates yet. <a href="/templates/new" class="text-blue-400">Create one</a>.</p></div>`;

  res.send(layout(lead.business_name, `
    <div class="space-y-6">

      <div class="${CARD} p-6">
        <div class="flex items-start justify-between">
          <div class="space-y-2">
            <div>${badge(lead.status)}</div>
            <p class="text-sm text-gray-400 mt-2">
              <span class="text-gray-500 font-medium">Email:</span>
              ${lead.email ? `<a href="mailto:${esc(lead.email)}" class="text-blue-400">${esc(lead.email)}</a>` : '<span class="text-gray-700">—</span>'}
            </p>
          </div>
          <div class="flex items-center gap-3" x-data>
            <a href="/leads/${lead.id}/edit" class="${BTN_SM}">Edit</a>
            <form method="POST" action="/leads/${lead.id}/delete"
              @submit.prevent="confirm('Delete ${esc(lead.business_name)}?') && $el.submit()">
              <button type="submit" class="inline-flex items-center px-3 py-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-400 text-xs font-semibold rounded-md transition-colors">
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>

      <h2 class="text-base font-semibold text-gray-300">Send Message</h2>
      ${templatePicker}

    </div>
  `, { back: { href: '/', label: 'Dashboard' } }));
});

app.get('/leads/:id/edit', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).send(layout('Not Found', '<p class="text-gray-500">Lead not found.</p>'));

  res.send(layout(`Edit: ${lead.business_name}`, `
    <div class="${CARD} p-6 max-w-xl">
      <form method="POST" action="/leads/${lead.id}/update">
        <label class="${LABEL}">Business Name <span class="text-red-500">*</span></label>
        <input class="${INPUT}" name="business_name" value="${esc(lead.business_name)}" required>

        <label class="${LABEL}">Email</label>
        <input class="${INPUT}" name="email" type="email" value="${lead.email ? esc(lead.email) : ''}">

        <label class="${LABEL}">WhatsApp Number</label>
        <input class="${INPUT}" name="wa_number" value="${lead.wa_number ? esc(lead.wa_number) : ''}">

        <label class="${LABEL}">Note</label>
        <textarea class="${INPUT}" name="note" rows="3">${lead.note ? esc(lead.note) : ''}</textarea>

        <label class="${LABEL}">Status</label>
        <select class="${INPUT}" name="status">
          ${['not_sent','sent','replied'].map(s =>
            `<option value="${s}" ${lead.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`
          ).join('')}
        </select>

        <div class="flex items-center gap-4 mt-6">
          <button type="submit" class="${BTN}">Save</button>
          <a href="/leads/${lead.id}" class="${BTN_GHOST}">Cancel</a>
        </div>
      </form>
    </div>
  `, { back: { href: `/leads/${lead.id}`, label: lead.business_name } }));
});

app.post('/leads/:id/update', (req, res) => {
  const { business_name, email, wa_number, note, status } = req.body;
  if (!business_name?.trim()) return res.redirect(`/leads/${req.params.id}/edit`);
  db.prepare('UPDATE leads SET business_name=?, email=?, wa_number=?, note=?, status=? WHERE id=?')
    .run(business_name.trim(), email || null, wa_number || null, note || null, status, req.params.id);
  res.redirect(`/leads/${req.params.id}`);
});

app.post('/leads/:id/delete', (req, res) => {
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.redirect('/');
});

app.get('/leads/:id/preview', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  const tmpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.query.template_id);
  if (!lead || !tmpl) return res.redirect(`/leads/${req.params.id}`);

  const merged = tmpl.body.replace(/{business_name}/g, lead.business_name);

  res.send(layout(`Preview — ${lead.business_name}`, `
    <div class="space-y-4 max-w-2xl">
      <p class="text-sm font-medium text-gray-400">${esc(tmpl.name)}</p>
      <div class="${CARD} px-5 py-5">
        <pre class="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">${esc(merged)}</pre>
      </div>
      <p class="text-sm text-gray-600 bg-gray-900 border border-gray-800 rounded-md px-4 py-3">Gmail send coming in Step 2.</p>
    </div>
  `, { back: { href: `/leads/${lead.id}`, label: lead.business_name } }));
});

// ---- TEMPLATES ----
app.get('/templates', (req, res) => {
  const templates = db.prepare('SELECT * FROM templates ORDER BY name').all();

  const rows = templates.length
    ? templates.map(t => `
      <tr class="hover:bg-gray-800/50 transition-colors" x-data>
        <td class="px-5 py-3.5 text-sm font-medium text-gray-200">${esc(t.name)}</td>
        <td class="px-5 py-3.5">
          <div class="flex items-center gap-4">
            <a href="/templates/${t.id}/edit" class="text-sm text-blue-400 hover:text-blue-300 font-medium">Edit</a>
            <form method="POST" action="/templates/${t.id}/delete"
              @submit.prevent="confirm('Delete template?') && $el.submit()">
              <button type="submit" class="text-sm text-red-500 hover:text-red-400 font-medium">Delete</button>
            </form>
          </div>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="2" class="px-5 py-12 text-center text-sm text-gray-600">
         No templates yet. <a href="/templates/new" class="text-blue-400 font-medium">Create your first template</a>.
       </td></tr>`;

  res.send(layout('Templates', `
    <div class="${CARD} overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
        <div>
          <h2 class="text-sm font-semibold text-gray-300">Message Templates</h2>
          <p class="text-xs text-gray-600 mt-0.5">Use <code class="bg-gray-800 px-1 rounded text-gray-400">{business_name}</code> in body</p>
        </div>
        <a href="/templates/new" class="${BTN_SM}">+ New Template</a>
      </div>
      <table class="w-full">
        <thead class="bg-gray-800/50 border-b border-gray-800">
          <tr class="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <th class="px-5 py-3 text-left">Name</th>
            <th class="px-5 py-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/60">${rows}</tbody>
      </table>
    </div>
  `));
});

function templateForm(t = {}) {
  const isEdit = !!t.id;
  return `
    <div class="${CARD} p-6 max-w-xl">
      <form method="POST" action="${isEdit ? `/templates/${t.id}/update` : '/templates'}">
        <label class="${LABEL}">Template Name <span class="text-red-500">*</span></label>
        <input class="${INPUT}" name="name" value="${t.name ? esc(t.name) : ''}"
               placeholder='e.g. "No website pitch"' required autofocus>

        <label class="${LABEL}">Body <span class="text-red-500">*</span></label>
        <p class="text-xs text-gray-600 mt-1">Use <code class="bg-gray-800 px-1 rounded text-gray-400">{business_name}</code> as placeholder</p>
        <textarea class="${INPUT}" name="body" rows="14" required>${t.body ? esc(t.body) : ''}</textarea>

        <div class="flex items-center gap-4 mt-6">
          <button type="submit" class="${BTN}">Save Template</button>
          <a href="/templates" class="${BTN_GHOST}">Cancel</a>
        </div>
      </form>
    </div>`;
}

app.get('/templates/new', (req, res) => {
  res.send(layout('New Template', templateForm(), { back: { href: '/templates', label: 'Templates' } }));
});

app.post('/templates', (req, res) => {
  const { name, body } = req.body;
  if (!name?.trim() || !body?.trim()) return res.redirect('/templates/new');
  db.prepare('INSERT INTO templates (name, channel, body) VALUES (?, ?, ?)')
    .run(name.trim(), 'email', body);
  res.redirect('/templates');
});

app.get('/templates/:id/edit', (req, res) => {
  const tmpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!tmpl) return res.status(404).send(layout('Not Found', '<p class="text-gray-500">Template not found.</p>'));
  res.send(layout(`Edit: ${tmpl.name}`, templateForm(tmpl), { back: { href: '/templates', label: 'Templates' } }));
});

app.post('/templates/:id/update', (req, res) => {
  const { name, body } = req.body;
  if (!name?.trim() || !body?.trim()) return res.redirect(`/templates/${req.params.id}/edit`);
  db.prepare('UPDATE templates SET name=?, body=? WHERE id=?')
    .run(name.trim(), body, req.params.id);
  res.redirect('/templates');
});

app.post('/templates/:id/delete', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.redirect('/templates');
});

app.listen(3000, () => console.log('ColdReach running → http://localhost:3000'));
