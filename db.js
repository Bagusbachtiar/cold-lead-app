const Database = require('better-sqlite3');
const db = new Database('data.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT NOT NULL,
    email TEXT,
    wa_number TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'not_sent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    channel TEXT NOT NULL CHECK(channel IN ('email', 'wa')),
    subject TEXT,
    body TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS job_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    applied_on TEXT NOT NULL,
    job_url TEXT,
    status TEXT NOT NULL DEFAULT 'applied'
      CHECK(status IN ('applied', 'interviewing', 'offer', 'rejected', 'withdrawn')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add the optional job source to existing databases without changing applications.
const jobCols = db.prepare('PRAGMA table_info(job_applications)').all().map(c => c.name);
if (!jobCols.includes('source')) db.exec('ALTER TABLE job_applications ADD COLUMN source TEXT');

// add channel column if not exists
const cols = db.prepare('PRAGMA table_info(leads)').all().map(c => c.name);
if (!cols.includes('channel')) db.exec('ALTER TABLE leads ADD COLUMN channel TEXT');

// backfill channel from old status values, then normalize status
db.exec(`
  UPDATE leads SET channel='gmail' WHERE status='sent_gmail' AND channel IS NULL;
  UPDATE leads SET channel='wa'    WHERE status='sent_wa'    AND channel IS NULL;
  UPDATE leads SET status='waiting' WHERE status NOT IN ('waiting','doing','replied');
`);

module.exports = db;
