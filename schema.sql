CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  current_plan_code TEXT NOT NULL DEFAULT 'trial',
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  plan_started_at TEXT,
  plan_expires_at TEXT,
  auto_renew INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS daily_usage (
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, usage_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage (usage_date);

CREATE TABLE IF NOT EXISTS plan_configs (
  id TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL UNIQUE,
  plan_name TEXT NOT NULL,
  price_month REAL NOT NULL,
  quota_month INTEGER NOT NULL,
  priority_level INTEGER NOT NULL DEFAULT 0,
  is_recommended INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  paypal_product_id TEXT,
  paypal_plan_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  period_type TEXT NOT NULL DEFAULT 'month',
  period_count INTEGER NOT NULL DEFAULT 1,
  payment_provider TEXT NOT NULL,
  payment_transaction_id TEXT,
  external_subscription_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  paid_at TEXT,
  effective_at TEXT,
  expires_at TEXT,
  raw_callback_payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscription_orders_user_id ON subscription_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_orders_status ON subscription_orders (payment_status);

CREATE TABLE IF NOT EXISTS user_usage_monthly (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  usage_month TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  quota_total INTEGER NOT NULL,
  quota_used INTEGER NOT NULL DEFAULT 0,
  quota_remaining INTEGER NOT NULL,
  reset_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, usage_month),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_usage_monthly_user_id ON user_usage_monthly (user_id);

CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  usage_month TEXT NOT NULL,
  action_type TEXT NOT NULL,
  consume_amount INTEGER NOT NULL DEFAULT 1,
  request_id TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_request_id ON usage_logs (request_id);

INSERT INTO plan_configs (
  id,
  plan_code,
  plan_name,
  price_month,
  quota_month,
  priority_level,
  is_recommended,
  is_enabled,
  sort_order
)
VALUES
  ('plan_trial', 'trial', '体验版', 9.9, 100, 0, 0, 1, 1),
  ('plan_standard', 'standard', '标准版', 19.9, 300, 1, 1, 1, 2),
  ('plan_premium', 'premium', '高级版', 39.9, 800, 2, 0, 1, 3)
ON CONFLICT(plan_code) DO UPDATE SET
  plan_name = excluded.plan_name,
  price_month = excluded.price_month,
  quota_month = excluded.quota_month,
  priority_level = excluded.priority_level,
  is_recommended = excluded.is_recommended,
  is_enabled = excluded.is_enabled,
  sort_order = excluded.sort_order,
  updated_at = CURRENT_TIMESTAMP;
