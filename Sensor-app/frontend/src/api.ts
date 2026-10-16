import axios from 'axios';
import { API_URL } from './config';
import { getUserId } from './auth';
import type { Reading, SensorDetails, SensorMap, SensorType } from './types';

// Typed wrappers around the backend REST API. The login token is added by the
// axios interceptor in auth.ts.

const userId = () => encodeURIComponent(getUserId() ?? '');

export const login = async (id: string, password: string) =>
    (await axios.post<{ success: boolean; token?: string }>(`${API_URL}/login`, { id, password })).data;

export const register = async (id: string, password: string) =>
    (await axios.post<{ success: boolean }>(`${API_URL}/register`, { id, password })).data;

export const changePassword = async (oldPassword: string, newPassword: string) =>
    (await axios.post<{ success: boolean }>(`${API_URL}/change-password`, { id: getUserId(), oldPassword, newPassword })).data;

export const getSensors = async (): Promise<SensorMap> =>
    (await axios.get<{ success: boolean; sensors?: SensorMap }>(`${API_URL}/sensors/${userId()}`)).data.sensors ?? {};

export const getReadings = async (sensorId: string, limit: number): Promise<Reading[]> =>
    (await axios.get<Reading[]>(`${API_URL}/sensor-data/${userId()}/${sensorId}`, { params: { limit } })).data;

export interface NewSensor {
    name: string;
    type: SensorType;
    details: SensorDetails;
}

export const registerSensor = async (sensor: NewSensor) =>
    (await axios.post<{ success: boolean; sensorId: string }>(`${API_URL}/register-sensor`, { ...sensor, userId: getUserId() })).data;

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
