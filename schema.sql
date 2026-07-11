-- SPDX-License-Identifier: GPL-3.0-or-later
--
-- NFD - No Fraud / Node Forward Bot
-- Copyright (C) 2024 LloydAsp (original author)
--
-- NFD-D1-V1 - Fork using D1 (SQLite) instead of Workers KV
-- Copyright (C) 2024 mireve (modifications)
--
-- This program is free software: you can redistribute it and/or modify
-- it under the terms of the GNU General Public License as published by
-- the Free Software Foundation, either version 3 of the License, or
-- (at your option) any later version.
--
-- This program is distributed in the hope that it will be useful,
-- but WITHOUT ANY WARRANTY; without even the implied warranty of
-- MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
-- GNU General Public License for more details.
--
-- You should have received a copy of the GNU General Public License
-- along with this program.  If not, see <https://www.gnu.org/licenses/>.
--
-- Modifications:
-- - Added fraud_users table for locally cached fraud database
-- - Added managed/fixed schema for all tables

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
