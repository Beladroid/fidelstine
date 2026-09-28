-- Fidelstine database (Cloudflare D1 / SQLite)
-- Apply locally:  npm run db:migrate:local
-- Apply live:     npm run db:migrate:remote

CREATE TABLE IF NOT EXISTS donations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_ref              TEXT    NOT NULL UNIQUE,          -- our reference, sent to Flutterwave
  flw_transaction_id  TEXT    UNIQUE,                   -- Flutterwave's id once paid
  amount              INTEGER NOT NULL,                 -- minor units (kobo, pence, cents)
  currency            TEXT    NOT NULL,
  amount_settled      REAL,                             -- what reaches the account, in settlement currency
  app_fee             REAL,
  campaign            TEXT    NOT NULL DEFAULT 'general',
  donor_name          TEXT    NOT NULL,
  donor_email         TEXT    NOT NULL,
  donor_phone         TEXT,
  donor_country       TEXT,
  message             TEXT,
  anonymous           INTEGER NOT NULL DEFAULT 0,
  newsletter          INTEGER NOT NULL DEFAULT 0,
  status              TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'successful', 'failed', 'abandoned')),
  payment_type        TEXT,
  notes               TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  verified_at         TEXT,
  receipt_sent_at     TEXT,
  raw_verify_json     TEXT
);
CREATE INDEX IF NOT EXISTS idx_donations_status   ON donations (status);
CREATE INDEX IF NOT EXISTS idx_donations_created  ON donations (created_at);
CREATE INDEX IF NOT EXISTS idx_donations_email    ON donations (donor_email);
CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations (campaign, status);

CREATE TABLE IF NOT EXISTS newsletter (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT NOT NULL UNIQUE,
  source           TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unsubscribed_at  TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  subject     TEXT,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS rate_events (
  key  TEXT    NOT NULL,
  ts   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_events ON rate_events (key, ts);
