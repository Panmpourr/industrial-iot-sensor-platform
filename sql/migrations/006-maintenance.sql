-- Maintenance (a small CMMS): scheduled tasks per area or equipment, and a work log.
--
--   maintenance_tasks   recurring work, e.g. "Replace air filter, every 30 days". next_due is a
--                       calendar date of the plant; completing the task moves it to the day it
--                       was done plus the interval.
--   maintenance_log     what was done, when and by whom: completed tasks, repairs, inspections.
--                       Kept when the equipment is deleted (asset_name keeps it readable).

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  asset_id      UUID NOT NULL,
  name          TEXT NOT NULL,
  interval_days INTEGER NOT NULL CHECK (interval_days BETWEEN 1 AND 3650),
  next_due      DATE NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, site_id),
  FOREIGN KEY (asset_id, site_id) REFERENCES assets (id, site_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS maintenance_tasks_site_due_idx ON maintenance_tasks (site_id, next_due);

CREATE TABLE IF NOT EXISTS maintenance_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  asset_id         UUID,
  asset_name       TEXT NOT NULL,
  task_id          UUID,
  kind             TEXT NOT NULL CHECK (kind IN ('preventive', 'repair', 'inspection', 'calibration', 'other')),
  performed_on     DATE NOT NULL,
  performed_by     VARCHAR(50) NOT NULL,   -- no foreign key: the record stays after the user is removed
  description      TEXT NOT NULL,
  duration_minutes INTEGER CHECK (duration_minutes BETWEEN 0 AND 100000),
  alarm_id         UUID REFERENCES alarms(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (asset_id, site_id) REFERENCES assets (id, site_id) ON DELETE SET NULL (asset_id),
  FOREIGN KEY (task_id, site_id) REFERENCES maintenance_tasks (id, site_id) ON DELETE SET NULL (task_id)
);

CREATE INDEX IF NOT EXISTS maintenance_log_site_date_idx ON maintenance_log (site_id, performed_on DESC, created_at DESC);
