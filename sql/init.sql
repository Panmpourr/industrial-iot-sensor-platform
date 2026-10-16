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
