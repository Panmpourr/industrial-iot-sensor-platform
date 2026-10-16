import { numericValue, type Reading, type Sensor, type SensorType } from './types';

/** Overall state of a sensor, from most to least severe. */
export type SensorStatus = 'critical' | 'warning' | 'stale' | 'normal' | 'nodata';

export const severityOrder: Record<SensorStatus, number> = {
    critical: 0,
    warning: 1,
    stale: 2,
    normal: 3,
    nodata: 4,
};

/** After this long without a reading the sensor is shown as "No recent data". */
const maxAgeMs: Record<SensorType, number> = {
    'Plc-Modbus': 30_000,
    'Plc-Opcua': 60_000,
    Arduino: 60_000,
    WeatherApi: 120_000,
    TTN: 60 * 60_000, // LoRaWAN devices often report only every few minutes
};

export const isStale = (sensor: Sensor, reading: Reading, now = Date.now()): boolean =>
    now - reading.timestamp > maxAgeMs[sensor.type];

/** The value that represents the sensor on overviews (temperature for weather sensors). */
export const primaryValue = (sensor: Sensor, reading: Reading): number | undefined =>
    sensor.type === 'WeatherApi' ? reading.temp : numericValue(reading);

/** Threshold status of one value using the sensor's warning / critical limits. */
export const evaluate = (sensor: Sensor, value: number | undefined): 'normal' | 'warning' | 'critical' | undefined => {
    const { warning, critical } = sensor.details.threshold ?? {};
    if (value === undefined || warning === undefined || critical === undefined) return undefined;
    if (value > critical) return 'critical';
    if (value > warning) return 'warning';
    return 'normal';
};

export const sensorStatus = (sensor: Sensor, latest: Reading | undefined, now = Date.now()): SensorStatus => {
    if (!latest) return 'nodata';
    if (isStale(sensor, latest, now)) return 'stale';

    // Prefer the status computed by the backend; fall back to the thresholds for older readings
    const reported = sensor.type === 'WeatherApi' ? latest.tempStatus : latest.status;
    return reported ?? evaluate(sensor, primaryValue(sensor, latest)) ?? 'normal';
};

export const isAlarm = (status: SensorStatus): boolean => status === 'critical' || status === 'warning' || status === 'stale';

/** Formats a reading value for display, e.g. `24.35 °C`. */
export const formatValue = (value: number | undefined, unit?: string): string => {
    if (value === undefined || Number.isNaN(value)) return '—';
    const text = Math.abs(value) >= 1000 ? value.toFixed(0) : Number(value.toFixed(2)).toString();
    return unit ? `${text} ${unit}` : text;
};

export const unitOf = (sensor: Sensor): string =>
    sensor.details.threshold?.unit || (sensor.type === 'WeatherApi' ? '°C' : '');

/** "5 s ago", "3 min ago", ... */
export const formatAge = (timestamp: number, now = Date.now()): string => {
    const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
    if (seconds < 60) return `${seconds} s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} h ago`;
    return new Date(timestamp).toLocaleDateString();
};

export const sensorTypeLabels: Record<SensorType, string> = {
    'Plc-Opcua': 'OPC UA',
    'Plc-Modbus': 'Modbus TCP',
    Arduino: 'Serial (Arduino)',
    TTN: 'LoRaWAN (TTN)',
    WeatherApi: 'Weather API',
};
