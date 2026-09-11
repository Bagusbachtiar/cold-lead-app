# ColdReach

A local cold outreach CRM for freelancers. Track leads, write templates with merge fields, send real emails via Gmail, and copy WhatsApp messages — all from one dashboard.

Built as a real tool for personal use and as a portfolio project.

Also includes a **Jobs** page for keeping your job application history in one place.

![Dashboard](https://i.imgur.com/placeholder.png)

## Features

- **Saved job websites** — keep an A–Z list of website names to check for jobs; add, edit, and delete them in the scrollable **Job Websites** modal on the Jobs page.
- **Job applications** — record company, job title, date applied, posting link, and notes; edit or delete records, search by company or role, filter by status, and track Applied / Interviewing / Offer / Rejected / Withdrawn.
- **Lead management** — add business name, email, or WhatsApp number per lead
- **Template library** — write reusable message templates with `{business_name}` and `{note}` placeholders, works in both subject and body
- **Gmail send** — real OAuth2 send via Gmail API (not SMTP, not mocked)
- **WhatsApp** — one-click copy of the merged message, paste into WhatsApp manually
- **Preview before send** — see exactly what will be sent (merged subject + body) before committing
- **Dashboard** — search, filter by status, paginated (10/page), inline status updates, per-lead notes
- **Status tracking** — Waiting / Doing / Replied with colored badges
- **Channel tracking** — Gmail or WA badge per lead

## Stack

| Layer | Tech |
|---|---|
| Server | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Frontend | Server-rendered HTML, Tailwind CSS CDN, Alpine.js CDN |
| Email | Google Gmail API via `googleapis` + OAuth2 |
| Auth | Google OAuth2 (single user, token stored in SQLite) |

No build step. No frontend framework. Runs locally.

## Setup

### Windows desktop app (one-click launch)

Double-click the **ColdReach** desktop shortcut, or `dist/ColdReach-win32-x64/ColdReach.exe`. It starts its local server and opens a dedicated window. Closing that window shuts down the server and the app; there is no tray process or Windows startup service. Opening it twice focuses the existing window.

The desktop build uses this project's existing `data.db` and `.env`; it does not create a second database or bundle your private data into the executable. Keep the project folder and the entire `dist/ColdReach-win32-x64` folder in place. The database location is recorded in `dist/ColdReach-win32-x64/resources/coldreach-local.json`.

The desktop app chooses an available local port, so other local apps can keep running. Gmail sign-in opens in your normal browser and temporarily needs port 3000 for Google's existing callback; if another app is using that port, close it temporarily before connecting Gmail. Existing Gmail tokens and the other features work on the desktop app's own port. Internet is still needed for Gmail and the UI's existing CDN resources.

For development, `npm run desktop` opens the wrapper. After changing the code, run `npm run desktop:build` to update the executable. On a fresh checkout, install dependencies and run `node node_modules/electron/install.js` to download the Electron runtime first. `npm run desktop:test` checks the packaged window and shutdown using temporary data. `desktop/shortcut.ps1` creates the Windows desktop shortcut after building.

### 1. Clone and install

```bash
git clone https://github.com/Bagusbachtiar/cold-lead-app.git
cd cold-lead-app
npm install
```

### 2. Google Cloud setup (one-time)

You need a GCP project with Gmail API enabled and OAuth2 credentials:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. Enable **Gmail API** (APIs & Services → Library)
4. OAuth consent screen → External → add your Gmail as a test user, scope: `gmail.send`
5. Credentials → Create → OAuth 2.0 Client ID → Web application
6. Add authorized redirect URI: `http://localhost:3000/auth/callback`
7. Copy the Client ID and Client Secret

### 3. Configure environment

Create a `.env` file in the project root:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first use, click **Connect Gmail** in the nav and complete the OAuth flow. Token is saved locally — you only do this once.

## Usage

1. **Templates** — create message templates first. Use `{business_name}` and `{note}` as placeholders in both subject and body.
2. **New Lead** — pick Gmail or WA channel, enter business name + contact, pick a template, click Preview.
3. **Preview** — see the fully merged message. Send via Gmail or copy for WhatsApp.
4. **Dashboard** — track all leads. Update status inline, add notes, search by name, filter by status.

### Track job applications

1. Open **Jobs** in the navigation, then **+ Add Application**.
2. Enter the company, job title, and date you applied. **Found on** is an optional dropdown populated from your saved **Job Websites**. Select a website, then optionally add the posting link and notes.
3. Save the application. Use the status dropdown and **Update** as you hear back.
4. Search by company, job title, or website, use the status cards to filter, and choose **Edit** to update details.

Applications are saved locally in SQLite. Gmail connection is not required for this feature.

Applications link to saved websites: renaming a website updates its name in application lists and searches. Deleting a website keeps the applications and their last saved website name. Older free-text sources are linked to matching saved websites automatically; unmatched names remain available on their existing applications.

### Save websites to check for jobs

Open **Jobs**, then click **Job Websites** to the right of the **Job Applications** heading. Enter only the website name (for example, LinkedIn or Indeed) and click **Add Website**. Websites appear alphabetically (A–Z); scroll the list when it gets long. Rename and delete websites inside the modal. Close it with **Close**, Escape, or a click outside it.

You can also open the modal using **Manage websites** below **Found on** when adding or editing an application. The dropdown updates automatically, keeping your application form intact.

## Tests

Run `npm test` to check application creation, editing, deletion, validation, search, filtering, pagination, and persistence. Tests use a temporary database and do not send emails.

## Project structure

```
server.js   — outreach routes, shared HTML layout, and Express entry point
desktop/    — desktop window, owned local server, packaging, and smoke test
jobs.js     — job application routes and views
job-websites.js — saved job website routes and views
job-websites-client.js — website modal interactions and dropdown updates
db.js       — SQLite schema + migrations
data.db     — SQLite database (gitignored)
.env        — Google OAuth credentials (gitignored)
```

## Constraints

- **Local only** — no hosting, no deployment config
- **WhatsApp manual send** — generates message text for manual copy/paste. No auto-send (WhatsApp ToS prohibits automated cold messages without opt-in)
- **Single user** — no multi-user auth
