-- Long-term history (historian) for sensor_data. Runs after init.sql on a new database.
-- Safe to run again on an existing database:
--   docker compose exec -T db psql -U <DB_USER> -d <DB_NAME> < sql/history.sql
--
--   sensor_data       raw readings          kept 90 days, compressed after 7 days
--   sensor_data_1m    1-minute min/avg/max  kept 1 year
--   sensor_data_1h    1-hour min/avg/max    kept forever
--
-- Charts never draw raw rows for long periods: the API picks the table whose resolution
-- fits the requested time range, so a year of data is still only a few hundred points.

-- Weather readings store their temperature as "temp"; copy it into the numeric columns
-- (newer rows get this when they are inserted).
UPDATE sensor_data
SET value = (payload->>'temp')::double precision,
    status = COALESCE(status, payload->>'tempStatus')
WHERE value IS NULL
  AND jsonb_typeof(payload->'temp') = 'number';

-- Status as a number so the worst status of a time bucket is simply max()
CREATE OR REPLACE FUNCTION status_rank(status TEXT) RETURNS SMALLINT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE status WHEN 'critical' THEN 2 WHEN 'warning' THEN 1 ELSE 0 END::SMALLINT
$$;

-- sum + count instead of avg, so coarser buckets can be built from finer ones exactly
CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_data_1m
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT sensor_id,
       time_bucket(INTERVAL '1 minute', time) AS bucket,
       min(value)                AS min_value,
       max(value)                AS max_value,
       sum(value)                AS sum_value,
       count(value)              AS count_value,
       max(status_rank(status))  AS worst_status
FROM sensor_data
WHERE value IS NOT NULL
GROUP BY sensor_id, bucket
WITH NO DATA;

-- Hierarchical aggregate: built from the 1-minute buckets, not from the raw rows
CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_data_1h
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT sensor_id,
       time_bucket(INTERVAL '1 hour', bucket) AS bucket,
       min(min_value)    AS min_value,
       max(max_value)    AS max_value,
       sum(sum_value)    AS sum_value,
       sum(count_value)  AS count_value,
       max(worst_status) AS worst_status
FROM sensor_data_1m
GROUP BY sensor_id, time_bucket(INTERVAL '1 hour', bucket)
WITH NO DATA;

-- Fill both from existing data, but only up to the last *complete* minute / hour: newer data
-- is then served live from the layer below instead of from a half-filled bucket.
CALL refresh_continuous_aggregate('sensor_data_1m', NULL, date_trunc('minute', now()));
CALL refresh_continuous_aggregate('sensor_data_1h', NULL, date_trunc('hour', now()));

-- Keep the aggregates up to date in the background. Rows newer than the last refresh are
-- still visible because the views are real-time (materialized_only = false).
SELECT add_continuous_aggregate_policy('sensor_data_1m',
  start_offset => INTERVAL '1 day', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('sensor_data_1h',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE);

-- Columnar compression of raw chunks older than 7 days (typically 90%+ smaller)
DO $$
BEGIN
  IF NOT (SELECT compression_enabled FROM timescaledb_information.hypertables
          WHERE hypertable_name = 'sensor_data') THEN
    ALTER TABLE sensor_data SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'sensor_id',
      timescaledb.compress_orderby = 'time DESC'
    );
  END IF;
END $$;

SELECT add_compression_policy('sensor_data', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention: drop old raw data and 1-minute buckets; the hourly history stays
SELECT add_retention_policy('sensor_data', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('sensor_data_1m', INTERVAL '365 days', if_not_exists => TRUE);
