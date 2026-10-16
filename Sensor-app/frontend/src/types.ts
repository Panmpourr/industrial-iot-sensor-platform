// Shapes of the data exchanged with the backend API.

export type SensorType = 'WeatherApi' | 'Arduino' | 'Plc-Modbus' | 'Plc-Opcua' | 'TTN';

export type Status = 'normal' | 'warning' | 'critical';

export interface Threshold {
    min?: number;
    max?: number;
    warning?: number;
    critical?: number;
    unit?: string;
}

/** Protocol-specific settings; which fields are used depends on the sensor type. */
export interface SensorDetails {
    latitude?: number;
    longitude?: number;
    threshold?: Threshold;
    // WeatherApi
    apiKey?: string;
    location?: string;
    // Arduino
    serialPort?: string;
    // Plc-Modbus
    ipAddress?: string;
    port?: string;
    registerAddress?: string;
    // Plc-Opcua
    endpointUrl?: string;
    nodeId?: string;
    // TTN
    applicationId?: string;
    clusterId?: string;
    deviceId?: string;
}

export interface Sensor {
    name: string;
    type: SensorType;
    details: SensorDetails;
    userId: string;
}

/** GET /sensors/{userId} returns sensors keyed by id. */
export type SensorMap = Record<string, Sensor>;

/**
 * One stored reading. Numeric sensors use `value`/`status`, WeatherApi uses
 * `temp`/`humidity`, TTN stores the decoded uplink in `raw`.
 */
export interface Reading {
    timestamp: number;
    value?: number | string | boolean;
    status?: Status;
    temp?: number;
    humidity?: number;
    tempStatus?: Status;
    humidityStatus?: Status;
    raw?: Record<string, unknown>;
}

/** Numeric value of a reading, if it has one (string/boolean OPC UA values are skipped). */
export const numericValue = (reading: Reading): number | undefined =>
    typeof reading.value === 'number' ? reading.value : undefined;
