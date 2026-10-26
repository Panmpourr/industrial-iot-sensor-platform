// Shapes of the data exchanged with the backend API.

export type SensorType = 'WeatherApi' | 'Arduino' | 'Plc-Modbus' | 'Plc-Opcua' | 'TTN';

export type Status = 'normal' | 'warning' | 'critical';

export interface Threshold {
    min?: number;
    max?: number;
    /** HI / HIHI: alarm above these values */
    warning?: number;
    critical?: number;
    /** LO / LOLO (optional): alarm below these values */
    lowWarning?: number;
    lowCritical?: number;
    /** How far the value must come back past a limit before its alarm clears (same unit). */
    deadband?: number;
    /** Seconds a limit must stay exceeded before the alarm is raised. */
    onDelay?: number;
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
    /** Area or equipment the sensor belongs to; null when unassigned. */
    assetId: string | null;
}

/** Area: a hall, line or zone, holding areas and equipment. Equipment: a machine, holding sensors. */
export type AssetKind = 'area' | 'equipment';

/** One node of the plant hierarchy (GET /assets). `parentId` is null at the top level. */
export interface Asset {
    id: string;
    parentId: string | null;
    name: string;
    kind: AssetKind;
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

/** One time bucket from GET /sensor-history. `t` is the bucket start (ms). */
export interface HistoryPoint {
    t: number;
    min: number;
    avg: number;
    max: number;
    count: number;
    status: Status;
}

export interface History {
    from: number;
    to: number;
    bucketSeconds: number;
    /** Table the points came from: raw readings or a 1-minute / 1-hour aggregate. */
    source: 'raw' | 'minute' | 'hour';
    points: HistoryPoint[];
}

export type AlarmCondition = 'HIHI' | 'HI' | 'LO' | 'LOLO' | 'COMM';

/** ISA-18.2 alarm state. "closed" alarms are only in the history. */
export type AlarmState = 'active-unacked' | 'active-acked' | 'cleared-unacked' | 'closed';

/** One alarm occurrence from GET /alarms or the live `alarm` message. Times in ms. */
export interface Alarm {
    id: string;
    sensorId: string;
    condition: AlarmCondition;
    priority: Status;
    /** The limit that was crossed; null for COMM */
    limit: number | null;
    /** Value that raised the alarm; null for COMM */
    value: number | null;
    raisedAt: number;
    clearedAt: number | null;
    ackedAt: number | null;
    ackedBy: string | null;
    state: AlarmState;
}

/** Site roles, each with the rights of the previous one. */
export type Role = 'operator' | 'engineer' | 'admin';

/** GET /profile: the signed-in user and their site. */
export interface Me {
    id: string;
    role: Role;
    siteId: string;
    siteName: string;
    mustChangePassword: boolean;
}

export interface SiteUser {
    id: string;
    role: Role;
    /** Still has the temporary password an admin set. */
    mustChangePassword: boolean;
    createdAt: number;
}

export interface AuditChange {
    field: string;
    from: string | null;
    to: string | null;
}

/** One audit trail entry (time in ms). */
export interface AuditEntry {
    id: string;
    time: number;
    userId: string;
    action: string;
    targetType: 'sensor' | 'alarm' | 'user' | 'site' | 'asset' | 'notification-rule' | 'maintenance-task' | 'maintenance-log';
    targetId: string | null;
    targetName: string | null;
    details: { changes?: AuditChange[]; [key: string]: unknown } | null;
}

/** One sensor over a report period (GET /sensor-stats). Times in seconds. */
export interface SensorStats {
    sensorId: string;
    /** null when the sensor had no readings in the period */
    min: number | null;
    avg: number | null;
    max: number | null;
    readings: number;
    /** Share of hours (0–1) with at least one reading; null if the sensor did not exist yet. */
    availability: number | null;
    warningSeconds: number;
    criticalSeconds: number;
}

export interface SensorStatsReport {
    from: number;
    to: number;
    /** Aggregates the figures came from: 1-minute, or 1-hour for periods older than a year. */
    source: 'minute' | 'hour';
    sensors: SensorStats[];
}

/** GET /telegram: whether the server can send Telegram messages, and whether the caller's chat is connected. */
export interface TelegramStatus {
    enabled: boolean;
    /** null until the bot has started */
    botUsername: string | null;
    connected: boolean;
}

/** Who is told about which alarms: `delayMinutes` 0 = when raised, else only if still unacknowledged after that long. */
export interface NotificationRule {
    id: string;
    userId: string;
    /** Area or equipment (with everything below it); null = the whole plant */
    assetId: string | null;
    minPriority: Status;
    delayMinutes: number;
}

export interface NotificationRecipient {
    id: string;
    role: Role;
    telegramConnected: boolean;
}

/** One delivery attempt (GET /notifications). Times as ISO strings. */
export interface NotificationLogEntry {
    id: string;
    alarmId: string;
    userId: string;
    delayMinutes: number;
    createdAt: string;
    sentAt: string | null;
    error: string | null;
    sensorId: string;
    sensorName: string;
    condition: AlarmCondition;
    priority: Status;
}

export type MaintenanceKind = 'preventive' | 'repair' | 'inspection' | 'calibration' | 'other';

/** A recurring maintenance task of an area or equipment. Dates are plant calendar days (yyyy-MM-dd). */
export interface MaintenanceTask {
    id: string;
    assetId: string;
    name: string;
    intervalDays: number;
    nextDue: string;
    notes: string | null;
    /** When it was last marked done; null if never */
    lastDone: string | null;
}

/** One entry of the work log. `assetId` is null once the equipment was deleted (`assetName` remains). */
export interface MaintenanceEntry {
    id: string;
    assetId: string | null;
    assetName: string;
    taskId: string | null;
    taskName: string | null;
    kind: MaintenanceKind;
    performedOn: string;
    performedBy: string;
    description: string;
    durationMinutes: number | null;
    alarmId: string | null;
    createdAt: string;
}
