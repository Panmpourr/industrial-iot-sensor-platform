import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

// Keep at most this many readings per sensor in memory (same as the initial history load)
export const MAX_READINGS = 1000;

/**
 * Creates the SignalR connection to the sensor hub. The server pushes
 * `reading(sensorId, reading)` for every sensor this client has subscribed to.
 */
export const createSensorConnection = () =>
    new HubConnectionBuilder()
        .withUrl(`${process.env.REACT_APP_API_URL}/hubs/sensors`, {
            accessTokenFactory: () => localStorage.getItem('token') || '',
        })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();

/** Appends a pushed reading to a sensor's history, ignoring duplicates and old values. */
export const appendReading = (history, reading) => {
    if (!history) {
        // History not loaded yet; it will include this reading
        return history;
    }
    const last = history[history.length - 1];
    if (last && last.timestamp >= reading.timestamp) {
        return history;
    }
    const next = [...history, reading];
    return next.length > MAX_READINGS ? next.slice(-MAX_READINGS) : next;
};
