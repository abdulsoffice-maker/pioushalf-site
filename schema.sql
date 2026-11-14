-- Cloudflare D1 schema for Salaamify Group. Apply with:
-- wrangler d1 execute salaamify-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  state TEXT NOT NULL,
  gstin TEXT,
  is_sister_discount_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  plan TEXT NOT NULL,
  months INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL,          -- GST-inclusive amount charged
  taxable_paise INTEGER NOT NULL,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  igst_paise INTEGER NOT NULL DEFAULT 0,
  gst_rate INTEGER NOT NULL,
  place_of_supply TEXT NOT NULL,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'created', -- created | paid | refunded | failed
  invoice_no TEXT UNIQUE,
  invoice_r2_key TEXT,
  membership_start TEXT,
  membership_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, paid_at);

CREATE TABLE IF NOT EXISTS invoice_counter (fy TEXT PRIMARY KEY, last_no INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Phase 2, stage 1: members, email-code sign-in, profiles, verification =====
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',          -- member | guardian | admin
  gender TEXT,                                  -- brother | sister
  status TEXT NOT NULL DEFAULT 'active',        -- active | suspended
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes(email, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  member_id INTEGER PRIMARY KEY REFERENCES members(id),
  display_name TEXT,
  age INTEGER,
  city TEXT,
  country TEXT,
  languages TEXT,
  profession TEXT,
  education TEXT,
  marriage_goals TEXT,
  religious_commitment TEXT,
  prayer_consistency TEXT,
  islamic_learning TEXT,
  family_values TEXT,
  marriage_preferences TEXT,
  lifestyle_preferences TEXT,
  about TEXT,
  photo_privacy TEXT NOT NULL DEFAULT 'guardian_approved', -- hidden | guardian_approved | members
  photo_r2_key TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verifications (
  member_id INTEGER NOT NULL REFERENCES members(id),
  level TEXT NOT NULL,                           -- mobile | email | identity | photo | guardian
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | verified | rejected
  evidence_r2_key TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, level)
);

-- ===== Phase 2, stage 2: guardians and interests =====
CREATE TABLE IF NOT EXISTS guardians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id),   -- the brother or sister being looked after
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  relationship TEXT NOT NULL,
  token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'invited',              -- invited | active | removed
  guardian_member_id INTEGER REFERENCES members(id),
  invited_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  UNIQUE (member_id, email)
);
CREATE INDEX IF NOT EXISTS idx_guardians_guardian ON guardians(guardian_member_id, status);

CREATE TABLE IF NOT EXISTS interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_member_id INTEGER NOT NULL REFERENCES members(id),
  to_member_id INTEGER NOT NULL REFERENCES members(id),
  message TEXT,
  -- awaiting_sender_guardian -> awaiting_recipient_guardian -> awaiting_recipient -> approved
  -- or declined / withdrawn at any point
  status TEXT NOT NULL DEFAULT 'awaiting_sender_guardian',
  declined_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interests_from ON interests(from_member_id, status);
CREATE INDEX IF NOT EXISTS idx_interests_to ON interests(to_member_id, status);

-- ===== Phase 2, stage 3: Marriage Discussion Rooms and moderation =====
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  interest_id INTEGER NOT NULL UNIQUE REFERENCES interests(id),
  sender_id INTEGER NOT NULL REFERENCES members(id),
  recipient_id INTEGER NOT NULL REFERENCES members(id),
  status TEXT NOT NULL DEFAULT 'awaiting_guardians',   -- awaiting_guardians | open | paused | closed
  sender_guardian_ok INTEGER NOT NULL DEFAULT 0,       -- guardian approved sharing contact details
  recipient_guardian_ok INTEGER NOT NULL DEFAULT 0,
  contacts_unlocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rooms_sender ON rooms(sender_id);
CREATE INDEX IF NOT EXISTS idx_rooms_recipient ON rooms(recipient_id);

CREATE TABLE IF NOT EXISTS room_guardian_joins (
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  guardian_member_id INTEGER NOT NULL REFERENCES members(id),
  side TEXT NOT NULL,                                   -- sender | recipient
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (room_id, guardian_member_id)
);

CREATE TABLE IF NOT EXISTS room_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  author_id INTEGER REFERENCES members(id),             -- NULL for system notices
  kind TEXT NOT NULL DEFAULT 'message',                 -- message | system
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_room_messages_room ON room_messages(room_id, id);

CREATE TABLE IF NOT EXISTS moderation_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER REFERENCES rooms(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  kind TEXT NOT NULL,                                   -- contact_attempt
  label TEXT,
  excerpt TEXT,
  status TEXT NOT NULL DEFAULT 'open',                  -- open | reviewed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_flags_room ON moderation_flags(room_id, member_id, created_at);

-- ===== Phase 2, stage 4: support tickets (admin, verification and audit use the tables above) =====
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',                  -- open | closed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, created_at);

-- ===== Phase 2, stage 5: Marriage Safety & Alignment (written confirmations before finalizing) =====
CREATE TABLE IF NOT EXISTS marriage_checks (
  room_id INTEGER PRIMARY KEY REFERENCES rooms(id),
  brother_answers TEXT,                 -- JSON, written by the brother
  brother_submitted_at TEXT,
  sister_choice TEXT,                   -- agreed | own_discretion
  sister_reply TEXT,
  sister_medical TEXT,                  -- her answer about sharing her own medical certificate
  sister_decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Stage 6: error log (the site records its own faults for the admin to see) =====
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT, path TEXT, status INTEGER, message TEXT,
  status_flag TEXT NOT NULL DEFAULT 'open',            -- open | resolved
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_error_log_flag ON error_log(status_flag, created_at);

-- ===== Stage 7: built-in rate limiter (sign-in endpoints) =====
CREATE TABLE IF NOT EXISTS rate_hits (
  key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rate_hits ON rate_hits(key, created_at);
