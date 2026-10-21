import type { Sensor, SensorDetails, SensorType } from '../types';

// Form model shared by the "Add sensor" and "Edit sensor" dialogs. All inputs are kept as
// strings while editing and converted to the stored SensorDetails shape on save.

export interface Field {
    key: keyof SensorDetails;
    label: string;
    placeholder?: string;
    helper?: string;
    secret?: boolean;
    optional?: boolean;
}

export const connectionFields: Record<SensorType, Field[]> = {
    'Plc-Opcua': [
        { key: 'endpointUrl', label: 'Endpoint URL', placeholder: 'opc.tcp://opcua-sim:4840' },
        { key: 'nodeId', label: 'Node ID', placeholder: 'ns=2;i=2', helper: 'e.g. ns=2;i=2 or ns=2;s=Temperature' },
    ],
    'Plc-Modbus': [
        { key: 'ipAddress', label: 'IP address', placeholder: '192.168.1.10' },
        { key: 'port', label: 'Port', placeholder: '502' },
        { key: 'registerAddress', label: 'Holding register', placeholder: '0' },
    ],
    TTN: [
        { key: 'applicationId', label: 'Application ID' },
        { key: 'clusterId', label: 'Tenant / cluster ID', placeholder: 'ttn' },
        { key: 'deviceId', label: 'Device ID' },
        { key: 'apiKey', label: 'API key', placeholder: 'NNSXS.…', secret: true },
    ],
    Arduino: [
        { key: 'serialPort', label: 'Serial port', placeholder: 'COM3 or /dev/ttyUSB0' },
    ],
    WeatherApi: [
        { key: 'location', label: 'Location', placeholder: 'Thessaloniki' },
        { key: 'apiKey', label: 'API key', secret: true },
    ],
};

export type ConnectionValues = Partial<Record<keyof SensorDetails, string>>;

export interface Limits {
    unit: string;
    min: string;
    max: string;
    warning: string;
    critical: string;
    latitude: string;
    longitude: string;
}

export const defaultLimits = (type: SensorType): Limits => ({
    unit: type === 'WeatherApi' ? '°C' : '',
    min: '0',
    max: type === 'WeatherApi' ? '40' : '100',
    warning: type === 'WeatherApi' ? '25' : '70',
    critical: type === 'WeatherApi' ? '30' : '90',
    latitude: '',
    longitude: '',
});

const isNumber = (text: string) => text.trim() !== '' && !Number.isNaN(Number(text));
const num = (text: string) => (text.trim() === '' ? undefined : Number(text));
const text = (value: unknown) => (value === undefined || value === null ? '' : String(value));

export const connectionValid = (type: SensorType, values: ConnectionValues): boolean =>
    connectionFields[type].every(f => f.optional || (values[f.key] ?? '').trim() !== '');

export const limitsValid = (limits: Limits): boolean =>
    [limits.min, limits.max, limits.warning, limits.critical].every(isNumber)
    && Number(limits.min) < Number(limits.max)
    && Number(limits.warning) <= Number(limits.critical)
    && [limits.latitude, limits.longitude].every(v => v.trim() === '' || isNumber(v));

/** Builds the stored settings from the form values. */
export const toDetails = (connection: ConnectionValues, limits: Limits): SensorDetails => ({
    ...Object.fromEntries(Object.entries(connection).map(([k, v]) => [k, v?.trim()])),
    latitude: num(limits.latitude),
    longitude: num(limits.longitude),
    threshold: {
        unit: limits.unit.trim(),
        min: Number(limits.min),
        max: Number(limits.max),
        warning: Number(limits.warning),
        critical: Number(limits.critical),
    },
});

/** Form values for an existing sensor (inverse of {@link toDetails}). */
export const fromSensor = (sensor: Sensor): { connection: ConnectionValues; limits: Limits } => {
    const d = sensor.details;
    const t = d.threshold ?? {};
    const defaults = defaultLimits(sensor.type);
    return {
        connection: Object.fromEntries(connectionFields[sensor.type].map(f => [f.key, text(d[f.key])])),
        limits: {
            unit: text(t.unit ?? defaults.unit),
            min: text(t.min ?? defaults.min),
            max: text(t.max ?? defaults.max),
            warning: text(t.warning ?? defaults.warning),
            critical: text(t.critical ?? defaults.critical),
            latitude: text(d.latitude),
            longitude: text(d.longitude),
        },
    };
};
