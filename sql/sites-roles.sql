-- Sites, user roles and the audit trail.
-- Sensors belong to a site (a plant); users are members of one site with a role:
--   operator: views data, acknowledges alarms
--   engineer: + adds, edits and deletes sensors and their limits
--   admin:    + manages the site's users
-- Runs automatically on a new database (after init.sql). On an existing database, run it once:
-- it moves every user, with their sensors, into a site of their own as admin. Safe to run again.

CREATE TABLE IF NOT EXISTS sites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sensors ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

-- Existing users: one site each, as its admin
DO $$
DECLARE
  u RECORD;
  new_site UUID;
BEGIN
  FOR u IN SELECT id FROM users WHERE site_id IS NULL LOOP
    INSERT INTO sites (name) VALUES (u.id || '''s site') RETURNING id INTO new_site;
    UPDATE users SET site_id = new_site, role = 'admin' WHERE id = u.id;
  END LOOP;
END $$;
UPDATE sensors s SET site_id = u.site_id FROM users u WHERE s.site_id IS NULL AND s.user_id = u.id;

ALTER TABLE users ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'operator';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('operator', 'engineer', 'admin'));
ALTER TABLE sensors ALTER COLUMN site_id SET NOT NULL;

-- sensors.user_id is now only "created by": removing a user must not delete the plant's sensors
ALTER TABLE sensors ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE sensors DROP CONSTRAINT IF EXISTS sensors_user_id_fkey;
ALTER TABLE sensors ADD CONSTRAINT sensors_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_site_id_idx ON users (site_id);
CREATE INDEX IF NOT EXISTS sensors_site_id_idx ON sensors (site_id);

-- Who changed what and when. No foreign keys on purpose: entries stay after a user or sensor is removed.
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  time        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     VARCHAR(50) NOT NULL,
  action      TEXT NOT NULL,             -- e.g. sensor.update, alarm.acknowledge, user.create
  target_type TEXT NOT NULL,             -- sensor | alarm | user | site
  target_id   TEXT,
  target_name TEXT,
  details     JSONB                      -- e.g. { "changes": [{ "field", "from", "to" }] }
);

CREATE INDEX IF NOT EXISTS audit_log_site_time_idx ON audit_log (site_id, time DESC);
