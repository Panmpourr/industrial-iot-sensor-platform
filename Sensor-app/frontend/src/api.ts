import axios from 'axios';
import { API_URL } from './config';
import { getUserId } from './auth';
import type { Alarm, Asset, AssetKind, AuditEntry, History, Me, Reading, Role, SensorDetails, SensorMap, SensorStatsReport, SensorType, SiteUser } from './types';

// Typed wrappers around the backend REST API. The login token is added by the
// axios interceptor in auth.ts.

const userId = () => encodeURIComponent(getUserId() ?? '');

export const login = async (id: string, password: string) =>
    (await axios.post<{ success: boolean; token?: string; mustChangePassword?: boolean }>(`${API_URL}/login`, { id, password })).data;

/** The signed-in user, their site and role. */
export const getProfile = async (): Promise<Me> =>
    (await axios.get<Me>(`${API_URL}/profile`, { params: { id: getUserId() } })).data;

/** Public: whether the sign-in page may offer self-registration. */
export const getAuthConfig = async () =>
    (await axios.get<{ registrationEnabled: boolean }>(`${API_URL}/auth-config`)).data;

export const register = async (id: string, password: string) =>
    (await axios.post<{ success: boolean }>(`${API_URL}/register`, { id, password })).data;

export const changePassword = async (oldPassword: string, newPassword: string) =>
    (await axios.post<{ success: boolean }>(`${API_URL}/change-password`, { id: getUserId(), oldPassword, newPassword })).data;

export const getSensors = async (): Promise<SensorMap> =>
    (await axios.get<{ success: boolean; sensors?: SensorMap }>(`${API_URL}/sensors/${userId()}`)).data.sensors ?? {};

export const getReadings = async (sensorId: string, limit: number): Promise<Reading[]> =>
    (await axios.get<Reading[]>(`${API_URL}/sensor-data/${userId()}/${sensorId}`, { params: { limit } })).data;

/** Min / average / max per time bucket; the server picks the bucket size for the range. */
export const getHistory = async (sensorId: string, from: Date, to: Date): Promise<History> =>
    (await axios.get<History>(`${API_URL}/sensor-history/${userId()}/${sensorId}`, {
        params: { from: from.toISOString(), to: to.toISOString() },
    })).data;

/** Min / average / max, availability and time outside limits of every sensor of the site, for reports. */
export const getSensorStats = async (from: Date, to: Date): Promise<SensorStatsReport> =>
    (await axios.get<SensorStatsReport>(`${API_URL}/sensor-stats`, {
        params: { from: from.toISOString(), to: to.toISOString() },
    })).data;

export interface NewSensor {
    name: string;
    type: SensorType;
    details: SensorDetails;
    assetId: string | null;
}

export const registerSensor = async (sensor: NewSensor) =>
    (await axios.post<{ success: boolean; sensorId: string }>(`${API_URL}/register-sensor`, { ...sensor, userId: getUserId() })).data;

/** Renames a sensor and/or changes its settings; the backend reconnects with the new settings. */
export const updateSensor = async (sensorId: string, changes: { name: string; details: SensorDetails; assetId: string | null }) => {
    await axios.put(`${API_URL}/update-sensor/${userId()}/${sensorId}`, changes);
};

export const deleteSensor = async (sensorId: string) => {
    await axios.delete(`${API_URL}/delete-sensor/${userId()}/${sensorId}`);
};

export const testOpcUaConnection = async (endpointUrl: string) =>
    (await axios.post<{ success: boolean; endpoints?: { endpointUrl: string; securityMode: string }[] }>(
        `${API_URL}/test-opcua-connection`, { endpointUrl })).data;

/** Downloads the full history of a sensor as a CSV file. */
export const downloadCsv = async (sensorId: string, sensorName: string) => {
    const response = await axios.get<Blob>(`${API_URL}/export-sensor-data/${userId()}/${sensorId}`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sensorName.replace(/\s+/g, '_')}_data.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

/** Alarms that are active or not yet acknowledged. */
export const getAlarms = async (): Promise<Alarm[]> =>
    (await axios.get<Alarm[]>(`${API_URL}/alarms/${userId()}`)).data;

/** Alarms raised between `from` and `to`, newest first. */
export const getAlarmHistory = async (from: Date, to: Date, sensorId?: string): Promise<Alarm[]> =>
    (await axios.get<Alarm[]>(`${API_URL}/alarm-history/${userId()}`, {
        params: { from: from.toISOString(), to: to.toISOString(), sensorId },
    })).data;

export const acknowledgeAlarms = async (alarmIds: string[]): Promise<Alarm[]> =>
    (await axios.post<{ success: boolean; alarms: Alarm[] }>(`${API_URL}/acknowledge-alarms/${userId()}`, { alarmIds })).data.alarms;

// ---- Plant hierarchy (changes need the engineer role) ----

export const getAssets = async (): Promise<Asset[]> =>
    (await axios.get<Asset[]>(`${API_URL}/assets`)).data;

export const createAsset = async (asset: { name: string; kind: AssetKind; parentId: string | null }) =>
    (await axios.post<{ success: boolean; id: string }>(`${API_URL}/assets`, asset)).data.id;

/** Renames an asset and/or moves it under another area (`parentId: null` = top level). */
export const updateAsset = async (assetId: string, changes: { name: string; parentId: string | null }) => {
    await axios.put(`${API_URL}/assets/${assetId}`, changes);
};

/** Fails with 409 while the asset still contains areas or equipment; its sensors become unassigned. */
export const deleteAsset = async (assetId: string) => {
    await axios.delete(`${API_URL}/assets/${assetId}`);
};

// ---- Site administration (admin) and audit trail (engineer, admin) ----

export const getSiteUsers = async (): Promise<SiteUser[]> =>
    (await axios.get<SiteUser[]>(`${API_URL}/site-users`)).data;

/** Adds a user with a temporary password they must change at the first sign-in. */
export const createSiteUser = async (id: string, password: string, role: Role) => {
    await axios.post(`${API_URL}/site-users`, { id, password, role });
};

export const updateUserRole = async (id: string, role: Role) => {
    await axios.put(`${API_URL}/site-users/${encodeURIComponent(id)}`, { role });
};

/** New temporary password for a user who forgot theirs; they must change it at the next sign-in. */
export const resetUserPassword = async (id: string, password: string) => {
    await axios.post(`${API_URL}/site-users/${encodeURIComponent(id)}/reset-password`, { password });
};

export const deleteSiteUser = async (id: string) => {
    await axios.delete(`${API_URL}/site-users/${encodeURIComponent(id)}`);
};

export const renameSite = async (name: string) => {
    await axios.put(`${API_URL}/site`, { name });
};

export const getAuditLog = async (from: Date, to: Date): Promise<AuditEntry[]> =>
    (await axios.get<AuditEntry[]>(`${API_URL}/audit-log`, { params: { from: from.toISOString(), to: to.toISOString() } })).data;
