-- The plant's asset hierarchy (ISA-95 style): site -> areas -> equipment -> sensors.
--   area:      a hall, line or zone; can contain areas and equipment
--   equipment: a machine (oven, pump, compressor); contains only sensors
-- A sensor can belong to one asset (an area or a piece of equipment), or to none.

CREATE TABLE IF NOT EXISTS assets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  parent_id  UUID,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('area', 'equipment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Target of the foreign keys below, which keep every link inside one site
  UNIQUE (id, site_id),
  -- An asset with children cannot be deleted (NO ACTION); the parent is always in the same site
  FOREIGN KEY (parent_id, site_id) REFERENCES assets (id, site_id)
);

-- No two assets with the same name side by side (top-level ones included, hence NULLS NOT DISTINCT)
CREATE UNIQUE INDEX IF NOT EXISTS assets_sibling_name_idx
  ON assets (site_id, parent_id, lower(name)) NULLS NOT DISTINCT;

ALTER TABLE sensors ADD COLUMN IF NOT EXISTS asset_id UUID;
-- Deleting an asset keeps its sensors, unassigned. SET NULL (asset_id) leaves site_id alone.
ALTER TABLE sensors DROP CONSTRAINT IF EXISTS sensors_asset_fkey;
ALTER TABLE sensors ADD CONSTRAINT sensors_asset_fkey
  FOREIGN KEY (asset_id, site_id) REFERENCES assets (id, site_id) ON DELETE SET NULL (asset_id);

CREATE INDEX IF NOT EXISTS sensors_asset_id_idx ON sensors (asset_id);
