require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const crypto = require('crypto');
const db = require('./db');

const app = express();
app.use(express.urlencoded({ extended: false }));

// ---- OAUTH2 ----
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/auth/callback'
);

oauth2Client.on('tokens', tokens => {
  const current = getToken() || {};
  saveToken({ ...current, ...tokens });
});

function getToken() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('gmail_token');
  return row ? JSON.parse(row.value) : null;
}

function saveToken(token) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('gmail_token', JSON.stringify(token));
}

// ---- STYLES ----
const INPUT     = 'w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mt-1 block';
const LABEL     = 'block text-sm font-medium text-gray-400 mt-4';
const BTN       = 'inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors';
const BTN_SM    = 'inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors';
const BTN_GHOST = 'text-sm text-gray-500 hover:text-gray-200 font-medium transition-colors';
const CARD      = 'bg-gray-900 border border-gray-800 rounded-lg shadow-sm';

function badge(status) {
  const cls = {
    waiting: 'bg-gray-700 text-gray-300',
    doing:   'bg-orange-900/60 text-orange-400',
    replied: 'bg-purple-900/60 text-purple-400',
  }[status] || 'bg-gray-800 text-gray-400';
  const label = { waiting: 'Waiting', doing: 'Doing', replied: 'Replied' }[status] || status;
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}">${label}</span>`;
}

function channelBadge(channel) {
  if (!channel) return '';
  const cls = { gmail: 'bg-blue-900/60 text-blue-400', wa: 'bg-green-900/60 text-green-400' }[channel] || 'bg-gray-800 text-gray-400';
  const label = { gmail: 'Gmail', wa: 'WA' }[channel] || channel;
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls}">${label}</span>`;
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function layout(title, body, { back } = {}) {
  const gmailConnected = !!getToken();
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
    <div class="ml-auto text-xs">
      ${gmailConnected
        ? '<span class="text-green-500 font-medium">Gmail ✓</span>'
        : '<a href="/auth/login" class="text-blue-400 hover:text-blue-300">Connect Gmail</a>'}
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

// ---- AUTH ----
app.get('/auth/login', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent',
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    saveToken(tokens);
    res.redirect('/');
  } catch (e) {
    res.status(500).send(layout('Auth Error', `<div class="${CARD} p-6 max-w-md"><p class="text-red-400 text-sm">${esc(e.message)}</p><a href="/auth/login" class="mt-4 inline-block ${BTN_GHOST}">Try again</a></div>`));
  }
});

// ---- DASHBOARD ----
app.get('/', (req, res) => {
  const { status } = req.query;
  const leads = status
    ? db.prepare('SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();

  const counts = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(status='waiting') as waiting,
      SUM(status='doing')   as doing,
      SUM(status='replied') as replied
    FROM leads
  `).get();

  const stats = [
    { label: 'All',     value: counts.total,   href: '/',                 active: !status,               color: 'text-white' },
    { label: 'Waiting', value: counts.waiting, href: '/?status=waiting',  active: status === 'waiting',  color: 'text-gray-300' },
    { label: 'Doing',   value: counts.doing,   href: '/?status=doing',    active: status === 'doing',    color: 'text-orange-400' },
    { label: 'Replied', value: counts.replied, href: '/?status=replied',  active: status === 'replied',  color: 'text-purple-400' },
  ].map(s => `
    <a href="${s.href}" class="${CARD} p-4 hover:border-gray-600 transition-all ${s.active ? 'ring-2 ring-blue-500 border-blue-500' : ''}">
      <div class="text-3xl font-bold ${s.color}">${s.value ?? 0}</div>
      <div class="text-xs text-gray-600 mt-1 font-medium uppercase tracking-wide">${s.label}</div>
    </a>`).join('');

  const STATUS_LABELS = { waiting: 'Waiting', doing: 'Doing', replied: 'Replied' };

  const rows = leads.length
    ? leads.map(l => `
      <tr data-name="${esc(l.business_name)}"
          x-show="!q || $el.dataset.name.toLowerCase().includes(q.toLowerCase())"
          class="hover:bg-gray-800/50 transition-colors">
        <td class="px-5 py-3.5 text-sm font-semibold">
          <div class="flex items-center gap-2">
            <a href="/leads/${l.id}" class="text-blue-400 hover:text-blue-300">${esc(l.business_name)}</a>
            ${channelBadge(l.channel)}
          </div>
        </td>
        <td class="px-5 py-3.5 text-sm text-gray-400">${l.email ? esc(l.email) : '<span class="text-gray-700">—</span>'}</td>
        <td class="px-5 py-3.5">
          <form method="POST" action="/leads/${l.id}/status" x-data="{ s: '${l.status}' }">
            <select name="status" x-model="s" onchange="this.form.submit()"
                    :class="{
                      'text-gray-300 border-gray-600 bg-gray-800':         s === 'waiting',
                      'text-orange-400 border-orange-800 bg-orange-900/30': s === 'doing',
                      'text-purple-400 border-purple-800 bg-purple-900/30': s === 'replied'
                    }"
                    class="border rounded px-2 py-1 text-xs focus:outline-none cursor-pointer transition-colors">
              ${Object.entries(STATUS_LABELS).map(([v, label]) =>
                `<option value="${v}" ${l.status === v ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          </form>
        </td>
        <td class="px-5 py-3.5">
          <button type="button"
                  data-note="${esc(l.note || '')}"
                  @click="noteId = ${l.id}; noteText = $el.dataset.note; modal = true"
                  class="text-xs px-2.5 py-1 rounded ${l.note ? 'bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/70' : 'bg-gray-800 text-gray-500 hover:text-gray-300'} transition-colors">
            ${l.note ? 'Note ✎' : '+ Note'}
          </button>
        </td>
        <td class="px-5 py-3.5 text-sm text-gray-600">${l.created_at.slice(0, 10)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="px-5 py-12 text-center text-sm text-gray-600">
         No leads yet. <a href="/leads/new" class="text-blue-400 font-medium">Add your first lead</a>.
       </td></tr>`;

  res.send(layout('Dashboard', `
    <div class="grid grid-cols-4 gap-4 mb-8">${stats}</div>
    <div class="${CARD} overflow-hidden" x-data="{ q: '', modal: false, noteId: null, noteText: '' }">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 gap-4">
        <h2 class="text-sm font-semibold text-gray-300 shrink-0">All Leads</h2>
        <input x-model="q" type="search" placeholder="Search business name…"
               class="flex-1 max-w-xs bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <a href="/leads/new" class="${BTN_SM} shrink-0">+ Add Lead</a>
      </div>
      <table class="w-full">
        <thead class="bg-gray-800/50 border-b border-gray-800">
          <tr class="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <th class="px-5 py-3 text-left">Business</th>
            <th class="px-5 py-3 text-left">Email</th>
            <th class="px-5 py-3 text-left">Status</th>
            <th class="px-5 py-3 text-left">Note</th>
            <th class="px-5 py-3 text-left">Added</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/60">${rows}</tbody>
      </table>

      <!-- Note modal -->
      <div x-show="modal" x-cloak
           class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
           @click.self="modal = false" @keydown.escape.window="modal = false">
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl">
          <h3 class="text-sm font-semibold text-gray-200 mb-3">Note</h3>
          <form method="POST" :action="'/leads/' + noteId + '/note'">
            <textarea name="note" x-model="noteText" rows="5"
                      class="${INPUT} mt-0" placeholder="Add a personal observation…"></textarea>
            <div class="flex gap-3 mt-4">
              <button type="submit" class="${BTN}">Save</button>
              <button type="button" @click="modal = false" class="${BTN_GHOST}">Cancel</button>
            </div>
          </form>
        </div>
      </div>
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
  const subject = tmpl.subject || tmpl.name;

  const hiddenFields = `
    <input type="hidden" name="business_name" value="${esc(business_name)}">
    <input type="hidden" name="email"         value="${esc(email || '')}">
    <input type="hidden" name="wa_number"     value="${esc(wa_number || '')}">
    <input type="hidden" name="template_id"   value="${esc(template_id)}">
    <input type="hidden" name="subject"       value="${esc(subject)}">
    <input type="hidden" name="merged"        value="${esc(merged)}">`;

  const gmailConnected = !!getToken();
  const gmailBtn = email
    ? gmailConnected
      ? `<form method="POST" action="/send-gmail">
          ${hiddenFields}
          <button type="submit" class="${BTN}">Send via Gmail</button>
        </form>`
      : `<a href="/auth/login" class="${BTN}">Connect Gmail to Send</a>`
    : `<span class="text-xs text-gray-600">No email — go back to add one</span>`;

  const waBtn = wa_number
    ? `<form method="POST" action="/send-wa">
        ${hiddenFields}
        <button type="submit" class="inline-flex items-center px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-md transition-colors">
          Send via WhatsApp
        </button>
      </form>`
    : '';

  res.send(layout(`Preview — ${esc(business_name)}`, `
    <div class="space-y-4 max-w-2xl">

      <div class="flex items-center gap-3">
        <span class="text-xs font-bold uppercase tracking-widest text-gray-600">Template</span>
        <span class="text-base font-semibold text-white">${esc(tmpl.name)}</span>
      </div>

      <div class="${CARD} px-5 py-4 text-sm divide-y divide-gray-800">
        <div class="flex gap-3 py-2.5 items-center first:pt-0 last:pb-0">
          <span class="w-16 shrink-0 text-gray-600 font-medium">To</span>
          ${email ? (() => {
            const AVATAR_COLORS = ['4f46e5','0891b2','059669','d97706','dc2626','7c3aed','db2777'];
            const color = AVATAR_COLORS[email.charCodeAt(0) % AVATAR_COLORS.length];
            const initials = email.slice(0, 2).toUpperCase();
            const gravatar = `https://www.gravatar.com/avatar/${crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex')}?s=28&d=404`;
            return `<div class="flex items-center gap-2.5">
              <div class="relative w-7 h-7 shrink-0">
                <div style="background:#${color}" class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold">${initials}</div>
                <img src="${gravatar}" class="w-7 h-7 rounded-full absolute inset-0" onerror="this.remove()">
              </div>
              <span class="text-gray-200">${esc(email)}</span>
            </div>`;
          })() : '<span class="text-gray-600">—</span>'}
        </div>
        <div class="flex gap-3 py-2.5 items-center first:pt-0 last:pb-0">
          <span class="w-16 shrink-0 text-gray-600 font-medium">Subject</span>
          <span class="text-gray-200">${esc(subject)}</span>
        </div>
      </div>

      <div class="${CARD} px-5 py-5">
        <pre class="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">${esc(merged)}</pre>
      </div>

      <div class="flex items-center gap-4 flex-wrap">
        ${gmailBtn}
        ${waBtn}
      </div>
    </div>
  `, { back: { href: '/leads/new', label: 'New Lead' } }));
});

app.post('/send-gmail', async (req, res) => {
  const { business_name, email, merged, subject } = req.body;
  if (!business_name || !email) return res.redirect('/leads/new');

  const token = getToken();
  if (!token) return res.redirect('/auth/login');

  try {
    oauth2Client.setCredentials(token);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const raw = [
      `To: ${email}`,
      `Subject: ${subject || 'Hello'}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      merged,
    ].join('\r\n');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: Buffer.from(raw).toString('base64url') },
    });

    db.prepare('INSERT INTO leads (business_name, email, channel, status) VALUES (?, ?, ?, ?)').run(business_name, email, 'gmail', 'waiting');

    res.send(layout('Email Sent!', `
      <div class="${CARD} p-6 max-w-md space-y-4">
        <p class="text-gray-300 text-sm">Email sent to <span class="text-white font-medium">${esc(email)}</span>.</p>
        <div><a href="/" class="${BTN}">Go to Dashboard</a></div>
      </div>
    `));
  } catch (e) {
    res.status(500).send(layout('Send Failed', `
      <div class="${CARD} p-6 max-w-md space-y-4">
        <p class="text-red-400 text-sm">${esc(e.message)}</p>
        <div class="flex gap-4">
          <a href="/auth/login" class="${BTN}">Re-connect Gmail</a>
          <a href="/" class="${BTN_GHOST}">Dashboard</a>
        </div>
      </div>
    `));
  }
});

app.post('/send-wa', (req, res) => {
  const { business_name, email, wa_number, merged } = req.body;
  if (!business_name || !wa_number) return res.redirect('/leads/new');
  db.prepare('INSERT INTO leads (business_name, email, wa_number, channel, status) VALUES (?, ?, ?, ?, ?)')
    .run(business_name, email || null, wa_number, 'wa', 'waiting');
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

  res.send(layout(lead.business_name, `
    <div class="space-y-6">
      <div class="${CARD} p-6">
        <div class="flex items-start justify-between">
          <div class="space-y-2">
            <div class="flex items-center gap-2">${channelBadge(lead.channel)}${badge(lead.status)}</div>
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

        <label class="${LABEL}">Note</label>
        <textarea class="${INPUT}" name="note" rows="3">${lead.note ? esc(lead.note) : ''}</textarea>

        <label class="${LABEL}">Status</label>
        <select class="${INPUT}" name="status">
          ${['not_sent','sent_gmail','sent_wa','replied'].map(s =>
            `<option value="${s}" ${lead.status === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`
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
  const { business_name, email, note, status } = req.body;
  if (!business_name?.trim()) return res.redirect(`/leads/${req.params.id}/edit`);
  db.prepare('UPDATE leads SET business_name=?, email=?, note=?, status=? WHERE id=?')
    .run(business_name.trim(), email || null, note || null, status, req.params.id);
  res.redirect(`/leads/${req.params.id}`);
});

app.post('/leads/:id/delete', (req, res) => {
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.redirect('/');
});

app.post('/leads/:id/status', (req, res) => {
  db.prepare('UPDATE leads SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.redirect(req.headers.referer || '/');
});

app.post('/leads/:id/note', (req, res) => {
  db.prepare('UPDATE leads SET note=? WHERE id=?').run(req.body.note || null, req.params.id);
  res.redirect(req.headers.referer || '/');
});

// ---- TEMPLATES ----
app.get('/templates', (req, res) => {
  const templates = db.prepare('SELECT * FROM templates ORDER BY name').all();

  const rows = templates.length
    ? templates.map(t => `
      <tr class="hover:bg-gray-800/50 transition-colors" x-data>
        <td class="px-5 py-3.5 text-sm font-medium text-gray-200">${esc(t.name)}</td>
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
    : `<tr><td colspan="3" class="px-5 py-12 text-center text-sm text-gray-600">
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
  return `
    <div class="${CARD} p-6 max-w-xl">
      <form method="POST" action="${isEdit ? `/templates/${t.id}/update` : '/templates'}">
        <label class="${LABEL}">Template Name <span class="text-red-500">*</span></label>
        <input class="${INPUT}" name="name" value="${t.name ? esc(t.name) : ''}"
               placeholder='e.g. "No website pitch"' required autofocus>

        <label class="${LABEL}">Email Subject <span class="text-gray-600 font-normal">(optional — used when sending via Gmail)</span></label>
        <input class="${INPUT}" name="subject" value="${t.subject ? esc(t.subject) : ''}" placeholder="e.g. Quick idea for your business">

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
  const { name, body, subject } = req.body;
  if (!name?.trim() || !body?.trim()) return res.redirect('/templates/new');
  db.prepare('INSERT INTO templates (name, channel, subject, body) VALUES (?, ?, ?, ?)')
    .run(name.trim(), 'email', subject?.trim() || null, body);
  res.redirect('/templates');
});

app.get('/templates/:id/edit', (req, res) => {
  const tmpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!tmpl) return res.status(404).send(layout('Not Found', '<p class="text-gray-500">Template not found.</p>'));
  res.send(layout(`Edit: ${tmpl.name}`, templateForm(tmpl), { back: { href: '/templates', label: 'Templates' } }));
});

app.post('/templates/:id/update', (req, res) => {
  const { name, body, subject } = req.body;
  if (!name?.trim() || !body?.trim()) return res.redirect(`/templates/${req.params.id}/edit`);
  db.prepare('UPDATE templates SET name=?, subject=?, body=? WHERE id=?')
    .run(name.trim(), subject?.trim() || null, body, req.params.id);
  res.redirect('/templates');
});

app.post('/templates/:id/delete', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.redirect('/templates');
});

app.listen(3000, () => console.log('ColdReach running → http://localhost:3000'));
