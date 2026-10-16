import { useMemo } from 'react';
import { useSensorData } from './SensorDataContext';
import { primaryValue, sensorStatus, severityOrder, unitOf, type SensorStatus } from '../status';
import type { Reading, Sensor } from '../types';

export interface SensorRow {
    id: string;
    sensor: Sensor;
    latest: Reading | undefined;
    value: number | undefined;
    unit: string;
    status: SensorStatus;
    /** Recent numeric values for sparklines. */
    trend: number[];
}

const SPARKLINE_POINTS = 60;

/** One row per sensor with its live value and status, most severe first. */
export const useSensorRows = (): SensorRow[] => {
    const { sensors, readings, now } = useSensorData();

    return useMemo(() => Object.entries(sensors)
        .map(([id, sensor]): SensorRow => {
            const history = readings[id] ?? [];
            const latest = history.at(-1);
            return {
                id,
                sensor,
                latest,
                value: latest ? primaryValue(sensor, latest) : undefined,
                unit: unitOf(sensor),
                status: sensorStatus(sensor, latest, now),
                trend: history.slice(-SPARKLINE_POINTS)
                    .map(r => primaryValue(sensor, r))
                    .filter((v): v is number => v !== undefined),
            };
        })
        .sort((a, b) => severityOrder[a.status] - severityOrder[b.status] || a.sensor.name.localeCompare(b.sensor.name)),
    [sensors, readings, now]);
};
