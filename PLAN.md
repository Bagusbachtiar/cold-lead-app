# Cold Outreach CRM — PLAN.md

## What this is
A local-only lead tracker for cold outreach (email + WhatsApp) to business owners found via Google Maps. Portfolio project + real tool for personal use. NOT hosted — runs locally via `npm run dev` / `node server.js`.

## Hard constraints
- **Timebox: 3 steps.** Started [DATE]. If Step 3 milestone isn't hit, ship what exists — do not extend scope.
- **No Gmaps scraping.** Leads are entered manually (name, email, WA number) — user finds them via Google Maps himself.
- **No WhatsApp auto-send.** WA messages generate a `wa.me?text=...` prefill link only. User clicks send inside WhatsApp manually. (Automating WA send violates WhatsApp Business API ToS re: opt-in for cold contacts — real ban risk.)
- **Email auto-send is allowed** via Gmail API with OAuth (user's own Google account, explicit consent).
- **YAGNI.** No follow-up sequences, no reply detection/IMAP polling, no CRM integrations, no multi-user auth. This is a single-user local tool.

## Stack
- Node.js + Express
- SQLite (better-sqlite3 or similar — matches the appointment-booking-system project, zero setup)
- Minimal server-rendered views or a simple static frontend (no need for a frontend framework — keep it light)
- Google APIs Node client (`googleapis`) for Gmail send via OAuth2

## Data model

**leads**
| field | type | notes |
|---|---|---|
| id | int PK | |
| business_name | text | |
| email | text | nullable |
| wa_number | text | nullable, E.164 format |
| note | text | personalized observation, e.g. "no online ordering" |
| status | text | `not_sent` \| `sent` \| `replied` |
| created_at | datetime | |

**templates**
| field | type | notes |
|---|---|---|
| id | int PK | |
| name | text | e.g. "No website", "Has website — AI automation pitch" |
| channel | text | `email` \| `wa` |
| subject | text | nullable, email only |
| body | text | supports placeholders: `{business_name}`, `{note}` |

## Day-by-day milestones

### Step 1 — Core data + templates
- [ ] Project scaffold, SQLite schema (leads, templates)
- [ ] CRUD routes/views for leads (add/edit/list — includes personalized `note` field)
- [ ] CRUD routes/views for templates (add/edit/list — name, channel, subject if email, body with placeholders)
- [ ] On a lead's page: template dropdown, **filtered to only show templates matching the channel you're about to send with** (email templates when sending email, WA templates when sending WA) — prevents picking the wrong template for the channel
- [ ] "Generate" flow: pick lead + pick template → merge `{business_name}` and `{note}` into template body → render filled text as a preview on screen
- **Milestone:** Create 2-3 templates, add a lead, pick a template, see correctly filled-in preview text.

**Confirmed UX flow (for reference while building):**
1. Build a small library of templates first (e.g. "No website", "Has website — AI automation pitch"), each tagged email or WA
2. Add a lead: business name, email, WA number, personalized note
3. On the lead's page, pick a template (dropdown filtered by channel)
4. App shows merged preview text
5. Send Email (real Gmail send) or Open WA (prefill link, manual send)
6. Editing a template later only affects future sends — doesn't retroactively change anything already sent

### Step 2 — Send infrastructure
- [ ] Google Cloud project + OAuth consent screen + Gmail API scope (manual setup in Google Console, not code)
- [ ] OAuth flow in app (login once, store token)
- [ ] "Send Email" button → calls Gmail API → actually sends
- [ ] "Send WA" button → generates and opens `wa.me?text=` link (no auto-send)
- **Milestone:** Send one real test email through the app to your own inbox.

### Step 3 — Status + polish + real use
- [ ] Status field: not_sent / sent / replied, updatable from dashboard
- [ ] Dashboard: list all leads, filter by status
- [ ] Use the app for real: send 3+ real cold emails to real leads (not test data)
- **Hard stop.** Whatever state it's in at the end of Step 3 is shipped. No "just one more feature."

## Explicitly out of scope (do not build)
- Google Maps scraping/API lookup
- WhatsApp auto-send via API or unofficial automation
- Reply detection / inbox polling
- Follow-up sequences / drip campaigns
- Multi-user support, deployment/hosting
- A/B testing, analytics, CRM integrations

## Current status
_(Update this section each session so context carries over.)_

- Steps 1, 2, 3: all complete and pushed to main
- App is feature-complete per the original 3-step timebox
- User-requested extension (2026-09-09): added a Jobs page for manually tracking job applications alongside freelance outreach.
- User-requested update (2026-09-10): optional "Found on" website field with suggestions and custom names, shown in the list and included in search. Existing applications keep their data with a blank source until edited.
- Job applications: company, role, date applied, optional posting link and notes; create/edit/delete, status updates, search, filters, and pagination. Statuses: applied / interviewing / offer / rejected / withdrawn.
- Implementation: `jobs.js` routes and views, a separate SQLite `job_applications` table, and Jobs navigation. No Gmail connection required.
- Validation: `npm test` passes all 8 tests covering the application workflow, website sources, invalid input, persistence, existing-database migration, and preservation of outreach records; JavaScript syntax and whitespace checks passed.

### What's been built
- Leads CRUD (business name, email, wa_number, note, status, channel)
- Templates CRUD (name, subject, body with `{business_name}` placeholder)
- New lead form: Gmail/WA toggle at top — Gmail shows email field, WA shows phone number field
- Preview page: merged template, Gmail send (real OAuth), WA shows copy button + "Save Lead (WA)"
- Gmail OAuth2 via `googleapis`, token stored in SQLite `settings` table, auto-refresh
- Dashboard: stat cards (All/Waiting/Doing/Replied), server-side search (`?q=`), server-side pagination (10/page), columns: #, Business, Channel badge, Contact (email or WA number), Status dropdown (inline, colored), Note (modal), Added date
- Status values: `waiting`, `doing`, `replied`
- Channel values: `gmail`, `wa` (separate column from status)
- Note modal: Alpine.js, opens inline from dashboard row

### Credentials
- `.env` has Google OAuth credentials (gitignored)
- OAuth token stored in SQLite `settings` table (key=`gmail_token`)

### Blockers / next ideas (not in scope yet)
- None blocking. Real use: add actual leads, send cold emails.
