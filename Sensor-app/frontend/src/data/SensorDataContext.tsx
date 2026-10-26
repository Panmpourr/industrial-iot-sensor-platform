import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HubConnectionState, type HubConnection } from '@microsoft/signalr';
import { createSensorConnection, appendReading } from '../realtime';
import { applyAlarm, playAlarmSound } from '../alarms';
import * as api from '../api';
import type { Alarm, Asset, Reading, SensorMap } from '../types';

/** Readings loaded per sensor for overviews and sparklines. */
const OVERVIEW_HISTORY = 120;
/** Readings loaded when a sensor's detail page is opened. */
export const DETAIL_HISTORY = 1000;

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

const MUTE_KEY = 'alarmSoundMuted';

const loadMuted = (): boolean => {
    try {
        return localStorage.getItem(MUTE_KEY) === 'true';
    } catch {
        return false;
    }
};

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
    /** The plant hierarchy (areas and equipment). */
    assets: Asset[];
    refreshAssets: () => Promise<void>;
    /** Alarms that are active or not yet acknowledged, kept up to date over SignalR. */
    alarms: Alarm[];
    acknowledge: (alarmIds: string[]) => Promise<void>;
    /** Sound for new critical alarms. */
    soundMuted: boolean;
    setSoundMuted: (muted: boolean) => void;
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
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [soundMuted, setSoundMutedState] = useState(loadMuted);
    const mutedRef = useRef(soundMuted);
    /** Alarm ids already shown, so only a newly raised alarm plays the sound. */
    const seenAlarmsRef = useRef(new Set<string>());

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

    const refreshAssets = useCallback(async () => {
        try {
            setAssets(await api.getAssets());
        } catch (error) {
            console.error('Could not load the plant hierarchy', error);
        }
    }, []);

    const removeSensor = useCallback(async (sensorId: string) => {
        await api.deleteSensor(sensorId);
        subscribedRef.current.delete(sensorId);
        setSensors(prev => without(prev, sensorId));
        setReadings(prev => without(prev, sensorId));
        setAlarms(prev => prev.filter(a => a.sensorId !== sensorId));
    }, []);

    const refreshAlarms = useCallback(async () => {
        try {
            const open = await api.getAlarms();
            open.forEach(a => seenAlarmsRef.current.add(a.id));
            setAlarms(open);
        } catch (error) {
            console.error('Could not load alarms', error);
        }
    }, []);

    const acknowledge = useCallback(async (alarmIds: string[]) => {
        const changed = await api.acknowledgeAlarms(alarmIds);
        setAlarms(prev => changed.reduce(applyAlarm, prev));
    }, []);

    const setSoundMuted = useCallback((muted: boolean) => {
        mutedRef.current = muted;
        setSoundMutedState(muted);
        try {
            localStorage.setItem(MUTE_KEY, String(muted));
        } catch {
            // Not persisted; the choice still applies until the page is reloaded
        }
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

    // Sensor list, plant hierarchy + clock
    useEffect(() => {
        refreshSensors();
        refreshAssets();
        const timer = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(timer);
    }, [refreshSensors, refreshAssets]);

    // Short history for every sensor, so overviews and sparklines have context
    useEffect(() => {
        for (const id of Object.keys(sensors)) {
            if (!readings[id]) loadHistory(id, OVERVIEW_HISTORY);
        }
        // Intentionally not depending on `readings`: only re-run when the sensor list changes
    }, [sensors, loadHistory]); // eslint-disable-line react-hooks/exhaustive-deps

    // Live connection
    useEffect(() => {
        const hub = createSensorConnection();
        hubRef.current = hub;
        const subscribed = subscribedRef.current;
        let stopped = false;

        hub.on('reading', (sensorId: string, reading: Reading) => {
            setReadings(prev => {
                const history = appendReading(prev[sensorId], reading);
                return !history || history === prev[sensorId] ? prev : { ...prev, [sensorId]: history };
            });
        });
        hub.on('alarm', (alarm: Alarm) => {
            const isNew = !seenAlarmsRef.current.has(alarm.id);
            seenAlarmsRef.current.add(alarm.id);
            if (isNew && alarm.state === 'active-unacked' && alarm.priority === 'critical' && !mutedRef.current) {
                playAlarmSound();
            }
            setAlarms(prev => applyAlarm(prev, alarm));
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
            subscribed.clear();
            hub.stop();
        };
    }, []);

    useEffect(() => {
        if (connection === 'live') syncSubscriptions(Object.keys(sensors));
    }, [connection, sensors, syncSubscriptions]);

    // Alarm list on every (re)connect, so changes missed while offline are picked up
    useEffect(() => {
        if (connection === 'live') refreshAlarms();
    }, [connection, refreshAlarms]);

    const value = useMemo<SensorDataValue>(() => ({
        sensors, sensorsLoaded, readings, connection, now, refreshSensors, loadHistory, removeSensor,
        assets, refreshAssets, alarms, acknowledge, soundMuted, setSoundMuted,
    }), [sensors, sensorsLoaded, readings, connection, now, refreshSensors, loadHistory, removeSensor,
        assets, refreshAssets, alarms, acknowledge, soundMuted, setSoundMuted]);

    return <SensorDataContext.Provider value={value}>{children}</SensorDataContext.Provider>;
};

export const useSensorData = (): SensorDataValue => {
    const value = useContext(SensorDataContext);
    if (!value) throw new Error('useSensorData must be used inside <SensorDataProvider>');
    return value;
};
