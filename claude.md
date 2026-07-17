# CLAUDE.md

Project instructions for Claude Code sessions on this repo.

## Read first
Always read `PLAN.md` before starting work. It has the scope, timebox, and current status. Update the "Current status" section at the end of every session — this is how context carries over between sessions.

## Project
Cold outreach lead tracker (email + WhatsApp) for personal freelance use. Also a portfolio piece. See PLAN.md for full scope.

## Ground rules
- **Stay in scope.** If a change isn't in PLAN.md's milestones, don't build it — flag it as a "later" idea instead of doing it now. This project has a hard 3-step timebox; scope creep is the main risk, not technical difficulty.
- **YAGNI.** No abstractions, config layers, or "future-proofing" for features not in the current milestone. Simple > extensible, for a single-user local tool.
- **No hosting/deployment work.** This runs locally only (`npm run dev`). Don't add Docker, CI, or cloud config unless explicitly asked.
- **Never implement WhatsApp auto-send.** Only generate `wa.me?text=` prefill links. This is a firm constraint, not a preference — WhatsApp Business API requires opt-in for cold contacts, so automating cold-send is a ToS/ban risk. If asked to "automate WhatsApp sending," push back and confirm before doing anything beyond a prefill link.
- **Gmail send requires real OAuth**, not a mocked/fake send. Use the `googleapis` npm package with OAuth2, store tokens locally (e.g. in SQLite or a local file), never hardcode credentials in source — use `.env` and make sure it's gitignored.
- **No Google Maps scraping.** Leads are entered manually by the user.

## Stack
- Node.js + Express
- SQLite (better-sqlite3)
- Server-rendered views or minimal static frontend — no frontend framework needed
- `googleapis` for Gmail API

## Conventions
- Keep routes RESTful and flat (`/leads`, `/leads/:id`, `/templates`, `/templates/:id`)
- Keep the whole thing in as few files as reasonably possible — this is a small tool, not a scaling product
- Commit at the end of each milestone (end of Step 1, Step 2, Step 3), not mid-feature

## When in doubt
Check PLAN.md's "Explicitly out of scope" list before adding anything not asked for.