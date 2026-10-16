import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HubConnectionState, type HubConnection } from '@microsoft/signalr';
import { createSensorConnection, appendReading } from '../realtime';
import * as api from '../api';
import type { Reading, SensorMap } from '../types';

/** Readings loaded per sensor for overviews and sparklines. */
const OVERVIEW_HISTORY = 120;
/** Readings loaded when a sensor's detail page is opened. */
export const DETAIL_HISTORY = 1000;

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

interface SensorDataValue {
    sensors: SensorMap;
    sensorsLoaded: boolean;
    readings: Record<string, Reading[]>;
    connection: ConnectionState;
    /** Current time, refreshed every few seconds so "x s ago" and stale detection stay current. */
    now: number;
    refreshSensors: () => Promise<void>;
    loadHistory: (sensorId: string, limit: number) => Promise<void>;
    removeSensor: (sensorId: string) => Promise<void>;
}

const SensorDataContext = createContext<SensorDataValue | null>(null);

const without = <T,>(map: Record<string, T>, key: string): Record<string, T> => {
    const copy = { ...map };
    delete copy[key];
    return copy;
};

/**
 * Loads the user's sensors once, keeps a live SignalR subscription to all of them and shares
 * the readings with every page, so navigating between pages never re-fetches or loses data.
 */
export const SensorDataProvider = ({ children }: { children: ReactNode }) => {
    const [sensors, setSensors] = useState<SensorMap>({});
    const [sensorsLoaded, setSensorsLoaded] = useState(false);
    const [readings, setReadings] = useState<Record<string, Reading[]>>({});
    const [connection, setConnection] = useState<ConnectionState>('connecting');
    const [now, setNow] = useState(() => Date.now());

    const hubRef = useRef<HubConnection | null>(null);
    const subscribedRef = useRef(new Set<string>());

    const loadHistory = useCallback(async (sensorId: string, limit: number) => {
        try {
            const history = await api.getReadings(sensorId, limit);
            setReadings(prev => ({ ...prev, [sensorId]: history }));
        } catch (error) {
            console.error(`Could not load readings for ${sensorId}`, error);
        }
    }, []);

    const refreshSensors = useCallback(async () => {
        try {
            setSensors(await api.getSensors());
        } catch (error) {
            console.error('Could not load sensors', error);
        } finally {
            setSensorsLoaded(true);
        }
    }, []);

    const removeSensor = useCallback(async (sensorId: string) => {
        await api.deleteSensor(sensorId);
        subscribedRef.current.delete(sensorId);
        setSensors(prev => without(prev, sensorId));
        setReadings(prev => without(prev, sensorId));
    }, []);

    // Subscribe to every sensor that isn't subscribed yet (after load, add, or reconnect)
    const syncSubscriptions = useCallback((ids: string[]) => {
        const hub = hubRef.current;
        if (!hub || hub.state !== HubConnectionState.Connected) return;
        for (const id of ids) {
            if (subscribedRef.current.has(id)) continue;
            subscribedRef.current.add(id);
            hub.invoke('Subscribe', id).catch(error => {
                subscribedRef.current.delete(id);
                console.error(`Could not subscribe to ${id}`, error);
            });
        }
    }, []);

    // Sensor list + clock
    useEffect(() => {
        refreshSensors();
        const timer = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(timer);
    }, [refreshSensors]);

    // Short history for every sensor, so overviews and sparklines have context
    useEffect(() => {
        for (const id of Object.keys(sensors)) {
            if (!readings[id]) loadHistory(id, OVERVIEW_HISTORY);
        }
        // Intentionally not depending on `readings`: only re-run when the sensor list changes
    }, [sensors, loadHistory]);

    // Live connection
    useEffect(() => {
        const hub = createSensorConnection();
        hubRef.current = hub;
        let stopped = false;

        hub.on('reading', (sensorId: string, reading: Reading) => {
            setReadings(prev => {
                const history = appendReading(prev[sensorId], reading);
                return !history || history === prev[sensorId] ? prev : { ...prev, [sensorId]: history };
            });
        });
        hub.onreconnecting(() => {
            subscribedRef.current.clear();
            setConnection('reconnecting');
        });
        hub.onreconnected(() => setConnection('live'));
        hub.onclose(() => {
            if (!stopped) setConnection('offline');
        });

        const start = async () => {
            try {
                await hub.start();
                setConnection('live');
            } catch (error) {
                if (stopped) return;
                setConnection('offline');
                console.warn('Live connection failed, retrying in 5 s', error);
                setTimeout(start, 5000);
            }
        };
        start();

        return () => {
            stopped = true;
            hubRef.current = null;
            subscribedRef.current.clear();
            hub.stop();
        };
    }, []);

    useEffect(() => {
        if (connection === 'live') syncSubscriptions(Object.keys(sensors));
    }, [connection, sensors, syncSubscriptions]);

    const value = useMemo<SensorDataValue>(() => ({
        sensors, sensorsLoaded, readings, connection, now, refreshSensors, loadHistory, removeSensor,
    }), [sensors, sensorsLoaded, readings, connection, now, refreshSensors, loadHistory, removeSensor]);

    return <SensorDataContext.Provider value={value}>{children}</SensorDataContext.Provider>;
};

export const useSensorData = (): SensorDataValue => {
    const value = useContext(SensorDataContext);
    if (!value) throw new Error('useSensorData must be used inside <SensorDataProvider>');
    return value;
};
