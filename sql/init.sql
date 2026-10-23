-- PostgreSQL + TimescaleDB schema
-- Runs automatically the first time the database container starts.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS users (
  id         VARCHAR(50) PRIMARY KEY,
  password   VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sensors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,              -- WeatherApi | TTN | Arduino | Plc-Modbus | Plc-Opcua
  details    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sensors_user_id_idx ON sensors (user_id);

-- Time-series measurements (TimescaleDB hypertable)
CREATE TABLE IF NOT EXISTS sensor_data (
  sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  time      TIMESTAMPTZ NOT NULL,
  value     DOUBLE PRECISION,            -- numeric reading (Arduino, Modbus, OPC UA)
  status    TEXT,                        -- normal | warning | critical
  payload   JSONB                        -- full reading as received (Weather, TTN, ...)
);

SELECT create_hypertable('sensor_data', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS sensor_data_sensor_time_idx ON sensor_data (sensor_id, time DESC);

-- Alarm journal (ISA-18.2). One row per alarm occurrence: raised when a limit is exceeded or the
-- sensor stops reporting, cleared when it returns to normal, acknowledged by an operator.
-- Active = cleared_at IS NULL; it leaves the alarm summary once it is both cleared and acknowledged.
CREATE TABLE IF NOT EXISTS alarms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_id   UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  condition   TEXT NOT NULL,             -- HIHI | HI | LO | LOLO | COMM
  priority    TEXT NOT NULL,             -- critical | warning
  limit_value DOUBLE PRECISION,          -- the limit that was crossed (NULL for COMM)
  value       DOUBLE PRECISION,          -- value that raised the alarm
  raised_at   TIMESTAMPTZ NOT NULL,
  cleared_at  TIMESTAMPTZ,
  acked_at    TIMESTAMPTZ,
  acked_by    VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS alarms_sensor_raised_idx ON alarms (sensor_id, raised_at DESC);
-- At most one active alarm per sensor and condition
CREATE UNIQUE INDEX IF NOT EXISTS alarms_one_active_idx ON alarms (sensor_id, condition) WHERE cleared_at IS NULL;
