const Database = require('better-sqlite3');
const path = require('node:path');
const db = new Database(path.join(process.env.COLDREACH_DATA_DIR || process.cwd(), 'data.db'));
db.pragma('foreign_keys = ON');

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
  CREATE TABLE IF NOT EXISTS job_websites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
if (!jobCols.includes('website_id')) {
  db.transaction(() => {
    db.exec('ALTER TABLE job_applications ADD COLUMN website_id INTEGER REFERENCES job_websites(id) ON DELETE SET NULL');
    // Match older free-text sources to saved websites, keeping unmatched text intact.
    db.exec(`UPDATE job_applications SET website_id = (
      SELECT id FROM job_websites WHERE trim(name) = trim(job_applications.source) COLLATE NOCASE ORDER BY id LIMIT 1
    ) WHERE source IS NOT NULL`);
  })();
}

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
