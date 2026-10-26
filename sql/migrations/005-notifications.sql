-- Notifications: alarms sent to people's phones (Telegram), with escalation.
--
--   notification_rules   who is told about which alarms: a user, the lowest priority, an area
--                        (NULL = the whole plant) and a delay. Delay 0 = as soon as the alarm is
--                        raised; delay N = only if it is still active and unacknowledged after N
--                        minutes (escalation is simply a second rule with a delay).
--   notifications        one row per alarm and rule, written before sending, so nobody gets the
--                        same alarm twice from one rule; also the delivery log shown in the app.

-- A user's Telegram chat, set when they open the one-time link from their account page
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_chat_idx ON users (telegram_chat_id);

-- Lets rules reference (user, site) pairs, so a rule can only name a user of its own site
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_site_key;
ALTER TABLE users ADD CONSTRAINT users_id_site_key UNIQUE (id, site_id);

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code       TEXT PRIMARY KEY,
  user_id    VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id       VARCHAR(50) NOT NULL,
  asset_id      UUID,
  min_priority  TEXT NOT NULL CHECK (min_priority IN ('warning', 'critical')),
  delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes BETWEEN 0 AND 1440),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, site_id) REFERENCES users (id, site_id) ON DELETE CASCADE,
  -- Deleting the area widens the rule to the whole plant rather than silently dropping it
  FOREIGN KEY (asset_id, site_id) REFERENCES assets (id, site_id) ON DELETE SET NULL (asset_id)
);

CREATE INDEX IF NOT EXISTS notification_rules_site_idx ON notification_rules (site_id);

CREATE TABLE IF NOT EXISTS notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  alarm_id            UUID NOT NULL REFERENCES alarms(id) ON DELETE CASCADE,
  rule_id             UUID REFERENCES notification_rules(id) ON DELETE SET NULL,
  user_id             VARCHAR(50) NOT NULL,   -- no foreign key: the log stays after a user is removed
  delay_minutes       INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ,
  error               TEXT,
  telegram_chat_id    BIGINT,
  telegram_message_id BIGINT,
  message_text        TEXT,
  UNIQUE (alarm_id, rule_id)
);

CREATE INDEX IF NOT EXISTS notifications_site_created_idx ON notifications (site_id, created_at DESC);
