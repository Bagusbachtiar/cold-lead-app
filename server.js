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
    not_sent: 'bg-gray-800 text-gray-300',
    sent:     'bg-green-900/60 text-green-400',
    replied:  'bg-blue-900/60 text-blue-400',
  }[status] || 'bg-gray-800 text-gray-300';
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}">${status.replace('_', ' ')}</span>`;
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
      SUM(status='not_sent') as not_sent,
      SUM(status='sent') as sent,
      SUM(status='replied') as replied
    FROM leads
  `).get();

  const stats = [
    { label: 'Total',    value: counts.total,    href: '/',                 active: !status,                   color: 'text-white' },
    { label: 'Not Sent', value: counts.not_sent,  href: '/?status=not_sent', active: status === 'not_sent',     color: 'text-gray-300' },
    { label: 'Sent',     value: counts.sent,      href: '/?status=sent',     active: status === 'sent',         color: 'text-green-400' },
    { label: 'Replied',  value: counts.replied,   href: '/?status=replied',  active: status === 'replied',      color: 'text-blue-400' },
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
    <div class="grid grid-cols-4 gap-4 mb-8">${stats}</div>
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
  res.send(layout('New Lead', `
    <div class="${CARD} p-6 max-w-xl">
      <form method="POST" action="/leads">
        <label class="${LABEL}">Business Name <span class="text-red-500">*</span></label>
        <input class="${INPUT}" name="business_name" required autofocus placeholder="e.g. Warung Pak Budi">

        <label class="${LABEL}">Email</label>
        <input class="${INPUT}" name="email" type="email" placeholder="owner@business.com">

        <label class="${LABEL}">WhatsApp Number <span class="text-gray-600 font-normal">(E.164 format)</span></label>
        <input class="${INPUT}" name="wa_number" placeholder="+628123456789">

        <label class="${LABEL}">Personalized Note</label>
        <textarea class="${INPUT}" name="note" rows="3" placeholder="e.g. no online ordering system, only accepts walk-ins"></textarea>

        <div class="flex items-center gap-4 mt-6">
          <button type="submit" class="${BTN}">Save Lead</button>
          <a href="/" class="${BTN_GHOST}">Cancel</a>
        </div>
      </form>
    </div>
  `));
});

app.post('/leads', (req, res) => {
  const { business_name, email, wa_number, note } = req.body;
  if (!business_name?.trim()) return res.redirect('/leads/new');
  db.prepare('INSERT INTO leads (business_name, email, wa_number, note) VALUES (?, ?, ?, ?)')
    .run(business_name.trim(), email || null, wa_number || null, note || null);
  res.redirect('/');
});

app.get('/leads/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).send(layout('Not Found', '<p class="text-gray-500">Lead not found.</p>'));

  const emailTemplates = db.prepare("SELECT id, name FROM templates WHERE channel = 'email' ORDER BY name").all();
  const waTemplates    = db.prepare("SELECT id, name FROM templates WHERE channel = 'wa' ORDER BY name").all();

  const sendSection = (label, icon, templates, channel, btnCls) => {
    if (!templates.length) return `
      <div class="${CARD} p-5">
        <h3 class="text-sm font-semibold text-gray-400 mb-2">${icon} ${label}</h3>
        <p class="text-sm text-gray-600">No ${label} templates yet. <a href="/templates/new" class="text-blue-400">Create one</a>.</p>
      </div>`;
    return `
      <div class="${CARD} p-5">
        <h3 class="text-sm font-semibold text-gray-400 mb-3">${icon} ${label}</h3>
        <form method="POST" action="/leads/${lead.id}/preview">
          <input type="hidden" name="channel" value="${channel}">
          <select name="template_id" class="${INPUT}">
            ${templates.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
          </select>
          <button type="submit" class="mt-3 inline-flex items-center px-4 py-2 ${btnCls} text-white text-sm font-medium rounded-md transition-colors">
            Generate Preview
          </button>
        </form>
      </div>`;
  };

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
            <p class="text-sm text-gray-400">
              <span class="text-gray-500 font-medium">WhatsApp:</span>
              ${lead.wa_number ? esc(lead.wa_number) : '<span class="text-gray-700">—</span>'}
            </p>
            <p class="text-sm text-gray-400">
              <span class="text-gray-500 font-medium">Note:</span>
              ${lead.note ? esc(lead.note) : '<span class="text-gray-700">—</span>'}
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
      <div class="grid grid-cols-2 gap-4">
        ${sendSection('Email', '✉', emailTemplates, 'email', 'bg-blue-600 hover:bg-blue-500')}
        ${sendSection('WhatsApp', '💬', waTemplates, 'wa', 'bg-green-700 hover:bg-green-600')}
      </div>

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

app.post('/leads/:id/preview', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  const tmpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.body.template_id);
  if (!lead || !tmpl) return res.redirect(`/leads/${req.params.id}`);

  const merged = tmpl.body
    .replace(/{business_name}/g, lead.business_name)
    .replace(/{note}/g, lead.note || '');

  const mergedSubject = tmpl.subject
    ? tmpl.subject.replace(/{business_name}/g, lead.business_name)
    : null;

  let actionBtn = '';
  if (tmpl.channel === 'wa') {
    if (lead.wa_number) {
      const digits = lead.wa_number.replace(/\D/g, '');
      actionBtn = `<a href="https://wa.me/${digits}?text=${encodeURIComponent(merged)}" target="_blank" rel="noopener"
          class="inline-flex items-center px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-md transition-colors">
          Open in WhatsApp
        </a>`;
    } else {
      actionBtn = `<p class="text-sm text-amber-400 bg-amber-900/20 border border-amber-800 rounded-md px-4 py-3">No WhatsApp number saved for this lead.</p>`;
    }
  } else {
    actionBtn = `<p class="text-sm text-gray-500 bg-gray-800 border border-gray-700 rounded-md px-4 py-3">Gmail send button coming in Step 2 (requires OAuth setup).</p>`;
  }

  res.send(layout(`Preview — ${lead.business_name}`, `
    <div class="space-y-4 max-w-2xl">
      <div class="flex items-center gap-3 text-sm text-gray-500">
        <span class="font-medium text-gray-300">${esc(tmpl.name)}</span>
        <span class="text-gray-700">|</span>
        <span>${tmpl.channel === 'wa' ? 'WhatsApp' : 'Email'}</span>
      </div>

      <div class="${CARD} overflow-hidden">
        ${mergedSubject ? `
          <div class="px-5 py-3 border-b border-gray-800 bg-gray-800/50">
            <p class="text-sm"><span class="font-semibold text-gray-400">Subject:</span> <span class="text-gray-200">${esc(mergedSubject)}</span></p>
          </div>` : ''}
        <div class="px-5 py-5">
          <pre class="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">${esc(merged)}</pre>
        </div>
      </div>

      <div>${actionBtn}</div>
    </div>
  `, { back: { href: `/leads/${lead.id}`, label: lead.business_name } }));
});

// ---- TEMPLATES ----
app.get('/templates', (req, res) => {
  const templates = db.prepare('SELECT * FROM templates ORDER BY channel, name').all();

  const rows = templates.length
    ? templates.map(t => `
      <tr class="hover:bg-gray-800/50 transition-colors" x-data>
        <td class="px-5 py-3.5 text-sm font-medium text-gray-200">${esc(t.name)}</td>
        <td class="px-5 py-3.5">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${t.channel === 'wa' ? 'bg-green-900/60 text-green-400' : 'bg-blue-900/60 text-blue-400'}">
            ${t.channel === 'wa' ? 'WhatsApp' : 'Email'}
          </span>
        </td>
        <td class="px-5 py-3.5 text-sm text-gray-500">${t.subject ? esc(t.subject) : '<span class="text-gray-700">—</span>'}</td>
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
    : `<tr><td colspan="4" class="px-5 py-12 text-center text-sm text-gray-600">
         No templates yet. <a href="/templates/new" class="text-blue-400 font-medium">Create your first template</a>.
       </td></tr>`;

  res.send(layout('Templates', `
    <div class="${CARD} overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
        <div>
          <h2 class="text-sm font-semibold text-gray-300">Message Templates</h2>
          <p class="text-xs text-gray-600 mt-0.5">Placeholders: <code class="bg-gray-800 px-1 rounded text-gray-400">{business_name}</code> <code class="bg-gray-800 px-1 rounded text-gray-400">{note}</code></p>
        </div>
        <a href="/templates/new" class="${BTN_SM}">+ New Template</a>
      </div>
      <table class="w-full">
        <thead class="bg-gray-800/50 border-b border-gray-800">
          <tr class="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <th class="px-5 py-3 text-left">Name</th>
            <th class="px-5 py-3 text-left">Channel</th>
            <th class="px-5 py-3 text-left">Subject</th>
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
  const channel = t.channel || 'email';
  return `
    <div class="${CARD} p-6 max-w-xl">
      <form method="POST" action="${isEdit ? `/templates/${t.id}/update` : '/templates'}"
            x-data="{ channel: '${channel}' }">

        <label class="${LABEL}">Template Name <span class="text-red-500">*</span></label>
        <input class="${INPUT}" name="name" value="${t.name ? esc(t.name) : ''}"
               placeholder='e.g. "No website pitch"' required autofocus>

        <label class="${LABEL}">Channel <span class="text-red-500">*</span></label>
        <select class="${INPUT}" name="channel" x-model="channel">
          <option value="email" ${channel === 'email' ? 'selected' : ''}>Email</option>
          <option value="wa"    ${channel === 'wa'    ? 'selected' : ''}>WhatsApp</option>
        </select>

        <div x-show="channel === 'email'" x-cloak>
          <label class="${LABEL}">Subject <span class="text-gray-600 font-normal">(email only)</span></label>
          <input class="${INPUT}" name="subject" value="${t.subject ? esc(t.subject) : ''}"
                 placeholder="Can use {business_name}">
        </div>

        <label class="${LABEL}">Body <span class="text-red-500">*</span></label>
        <p class="text-xs text-gray-600 mt-1">Use <code class="bg-gray-800 px-1 rounded">{business_name}</code> and <code class="bg-gray-800 px-1 rounded">{note}</code></p>
        <textarea class="${INPUT}" name="body" rows="12" required>${t.body ? esc(t.body) : ''}</textarea>

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
  const { name, channel, subject, body } = req.body;
  if (!name?.trim() || !body?.trim()) return res.redirect('/templates/new');
  db.prepare('INSERT INTO templates (name, channel, subject, body) VALUES (?, ?, ?, ?)')
    .run(name.trim(), channel, subject || null, body);
  res.redirect('/templates');
});

app.get('/templates/:id/edit', (req, res) => {
  const tmpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!tmpl) return res.status(404).send(layout('Not Found', '<p class="text-gray-500">Template not found.</p>'));
  res.send(layout(`Edit: ${tmpl.name}`, templateForm(tmpl), { back: { href: '/templates', label: 'Templates' } }));
});

app.post('/templates/:id/update', (req, res) => {
  const { name, channel, subject, body } = req.body;
  if (!name?.trim() || !body?.trim()) return res.redirect(`/templates/${req.params.id}/edit`);
  db.prepare('UPDATE templates SET name=?, channel=?, subject=?, body=? WHERE id=?')
    .run(name.trim(), channel, subject || null, body, req.params.id);
  res.redirect('/templates');
});

app.post('/templates/:id/delete', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.redirect('/templates');
});

app.listen(3000, () => console.log('ColdReach running → http://localhost:3000'));
