CREATE TABLE IF NOT EXISTS msg_mappings (
  forwarded_msg_id INTEGER PRIMARY KEY,
  guest_chat_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocked_users (
  chat_id TEXT PRIMARY KEY,
  is_blocked INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS notify_timestamps (
  chat_id TEXT PRIMARY KEY,
  last_time INTEGER NOT NULL
);
