const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'waguan.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// Wait up to 5s for a write lock instead of failing instantly under
// concurrent load (safer on a single-process server).
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  about TEXT DEFAULT 'Hey there! I am using Waguan.',
  is_online INTEGER DEFAULT 0,
  last_seen TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_group INTEGER DEFAULT 0,
  name TEXT,
  avatar_url TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, user_id),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  body TEXT,
  media_url TEXT,
  media_type TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS message_receipts (
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  delivered_at TEXT,
  read_at TEXT,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- E2E encryption + multi-device support
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_seen TEXT,
  device_id TEXT UNIQUE NOT NULL,
  identity_pub TEXT,
  signed_prekey_pub TEXT,
  signed_prekey_id INTEGER,
  signature TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One signed prekey per device (rotated). identity_pub, signed_prekey_pub,
-- and signature are stored so other clients can fetch a prekey bundle.
CREATE TABLE IF NOT EXISTS prekeys (
  device_id INTEGER NOT NULL,
  key_id INTEGER NOT NULL,
  prekey_pub TEXT NOT NULL,
  is_one_time INTEGER DEFAULT 0,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (device_id, key_id),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  peer_device_id INTEGER NOT NULL,
  ratchet_state TEXT,          -- encrypted client-side serialized DL ratchet state
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE (user_id, peer_device_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (peer_device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- message body / media now stored as opaque ciphertext (base64). The
-- server never sees plaintext.
`);

// Guarded migrations for existing databases (better-sqlite3 runs the whole
// exec() above atomically; ALTER can't be in a conditional so we add
// columns here idempotently).
function addColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!existing) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('messages', 'ciphertext', 'TEXT');
addColumn('messages', 'media_ciphertext', 'TEXT');
addColumn('messages', 'media_enc_key', 'TEXT');
addColumn('messages', 'media_type_stored', 'TEXT');
addColumn('messages', 'sender_device_id', 'INTEGER');
addColumn('messages', 'ratchet_header', 'TEXT');
// Edit support: an edited message is inserted as a NEW encrypted row that
// points back at the original via edited_message_id (server never sees
// plaintext; edits simply ratchet a fresh ciphertext like any new message).
addColumn('messages', 'edited_message_id', 'INTEGER');
addColumn('messages', 'edited_at', 'TEXT');
// Public handle (@username) — optional, unique per account.
addColumn('users', 'username', 'TEXT');

db.exec(`
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  initiator_id INTEGER NOT NULL,
  kind TEXT NOT NULL,             -- 'voice' | 'video'
  status TEXT NOT NULL,           -- 'ringing' | 'ongoing' | 'ended' | 'missed' | 'rejected' | 'declined'
  started_at TEXT,
  ended_at TEXT,
  duration_sec INTEGER,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (initiator_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
`);

db.exec(`
-- Blocks: (user_id blocks blocked_user_id). Unidirectional like WhatsApp.
CREATE TABLE IF NOT EXISTS blocks (
  user_id INTEGER NOT NULL,
  blocked_user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, blocked_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocks_user ON blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_user_id);
`);

module.exports = db;
