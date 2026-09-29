-- Staff console: accounts, uploaded images, an activity log, and read/unread for messages.

CREATE TABLE IF NOT EXISTS staff (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL UNIQUE,
  role           TEXT    NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor')),
  password_hash  TEXT    NOT NULL,
  avatar_id      TEXT,
  disabled       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at  TEXT
);

-- Photos uploaded from the console. Resized in the browser before upload (large up to 1600px,
-- small up to 480px, WebP), so each row stays well under D1's 2 MB row limit.
CREATE TABLE IF NOT EXISTS images (
  id          TEXT    PRIMARY KEY,
  kind        TEXT    NOT NULL DEFAULT 'gallery',
  mime        TEXT    NOT NULL,
  width       INTEGER,
  height      INTEGER,
  bytes       INTEGER NOT NULL,
  data        BLOB    NOT NULL,
  thumb       BLOB    NOT NULL,
  alt         TEXT    NOT NULL DEFAULT '',
  caption     TEXT    NOT NULL DEFAULT '',
  in_gallery  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_images_gallery ON images (in_gallery, created_at);
CREATE INDEX IF NOT EXISTS idx_images_kind ON images (kind, created_at);

CREATE TABLE IF NOT EXISTS audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor   TEXT    NOT NULL,
  action  TEXT    NOT NULL,
  detail  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit (at);

ALTER TABLE messages ADD COLUMN read_at TEXT;
