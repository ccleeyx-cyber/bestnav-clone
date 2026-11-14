-- BestNav Clone · schema
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',      -- owner | admin | member
  display_name TEXT NOT NULL DEFAULT '',
  public_key TEXT,                          -- ssh/ed25519 public key for MCP auth
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public', -- public | private
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  collapsed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  internal_url TEXT,                        -- 内网地址
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  icon_color TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'public',
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  last_status INTEGER,
  last_latency_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_group ON bookmarks(group_id);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                        -- clock|weather|search|note|stock|quote|media|container|...
  title TEXT DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',         -- JSON
  position TEXT NOT NULL DEFAULT '{}',        -- JSON {x,y,w,h,template}
  visibility TEXT NOT NULL DEFAULT 'public',
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS navpacks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'official',
  url TEXT,
  installed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS navpack_items (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES navpacks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT DEFAULT '',
  lang TEXT DEFAULT 'zh',
  description TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_pack_items ON navpack_items(pack_id);

CREATE TABLE IF NOT EXISTS search_sources (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,                    -- web|music|movie|book|doc|paper|image|video|file|software|skill|ai
  name TEXT NOT NULL,
  url_template TEXT NOT NULL,
  icon TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT DEFAULT '',
  detail TEXT DEFAULT '{}',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS relays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  models TEXT DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  weight INTEGER NOT NULL DEFAULT 1,
  health_state TEXT NOT NULL DEFAULT 'idle',  -- idle|healthy|cooldown|disabled|exhausted
  cooldown_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relay_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  allowed_models TEXT DEFAULT '[]',
  budget_usd REAL,
  used_usd REAL NOT NULL DEFAULT 0,
  expires_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relay_usage (
  id TEXT PRIMARY KEY,
  relay_id TEXT,
  token_id TEXT,
  model TEXT DEFAULT '',
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  status_code INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relay_usage_created ON relay_usage(created_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  allowed_tools TEXT DEFAULT '[]',
  allowed_ips TEXT DEFAULT '[]',
  rate_limit INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- container|host|ssl|http
  target TEXT NOT NULL,
  interval_sec INTEGER NOT NULL DEFAULT 60,
  threshold TEXT DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_status TEXT DEFAULT 'unknown',
  last_checked_at TEXT,
  last_detail TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS traffic_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  rx_bytes INTEGER NOT NULL DEFAULT 0,
  tx_bytes INTEGER NOT NULL DEFAULT 0,
  iface TEXT DEFAULT '',
  granularity TEXT NOT NULL DEFAULT 'minute'
);
CREATE INDEX IF NOT EXISTS idx_traffic_ts ON traffic_samples(ts DESC);

CREATE TABLE IF NOT EXISTS traffic_events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ssl_certs (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  issuer TEXT DEFAULT '',
  not_before TEXT,
  not_after TEXT,
  days_left INTEGER,
  health INTEGER,
  last_checked_at TEXT,
  history TEXT DEFAULT '[]',
  UNIQUE(domain)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,                     -- wecom|dingtalk|feishu|telegram|bark|gotify|ntfy|webhook
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tools_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitor_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  path TEXT NOT NULL,
  ip_hash TEXT,
  ua_family TEXT DEFAULT '',
  device TEXT DEFAULT '',
  referrer TEXT DEFAULT '',
  country TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_visitor_ts ON visitor_stats(ts DESC);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  folder TEXT DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  todo TEXT DEFAULT '[]',
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,                        -- YYYY-MM-DD
  all_day INTEGER NOT NULL DEFAULT 1,
  time_start TEXT,
  time_end TEXT,
  source TEXT NOT NULL DEFAULT 'manual',      -- manual|ssl|backup
  ref_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cal_date ON calendar_events(date);

CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                        -- manual|scheduled|webdav
  path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
