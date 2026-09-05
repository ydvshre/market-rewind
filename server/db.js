// Uses Node's built-in SQLite support, so no native addon compilation is needed.
// This works with modern Node 22/24 and avoids better-sqlite3/node-gyp setup issues.
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const db = new DatabaseSync(path.join(__dirname, "market-rewind.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  user_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (user_id, ticker),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_checkpoints (
  user_id INTEGER PRIMARY KEY,
  last_viewed_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stocks (
  ticker TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  baseline_stdev REAL NOT NULL DEFAULT 0.02,
  baseline_updated_at TEXT,
  last_price REAL,
  previous_price REAL,
  last_observed_at TEXT,
  data_source TEXT NOT NULL DEFAULT 'mock',
  freshness_note TEXT NOT NULL DEFAULT 'Demo data'
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  price REAL NOT NULL,
  observed_at TEXT NOT NULL,
  data_source TEXT NOT NULL,
  FOREIGN KEY(ticker) REFERENCES stocks(ticker)
);

CREATE TABLE IF NOT EXISTS market_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  previous_price REAL NOT NULL,
  current_price REAL NOT NULL,
  move_pct REAL NOT NULL,
  baseline_stdev REAL NOT NULL,
  z_score REAL NOT NULL,
  confidence TEXT NOT NULL,
  headline TEXT,
  headline_source TEXT,
  summary_1 TEXT NOT NULL,
  summary_3 TEXT NOT NULL,
  summary_full TEXT NOT NULL,
  FOREIGN KEY(ticker) REFERENCES stocks(ticker)
);

CREATE INDEX IF NOT EXISTS idx_events_ticker_time
  ON market_events(ticker, detected_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_ticker_time
  ON market_snapshots(ticker, observed_at);
`);

module.exports = db;
