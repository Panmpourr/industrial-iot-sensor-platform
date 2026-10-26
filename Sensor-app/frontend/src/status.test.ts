import { describe, expect, it } from 'vitest';
import { evaluate, formatAge, formatValue, sensorStatus } from './status';
import type { Sensor } from './types';

const now = 1_800_000_000_000;

const opcua: Sensor = {
    name: 'Oven',
    type: 'Plc-Opcua',
    userId: 'alice',
    assetId: null,
    details: { threshold: { warning: 25, critical: 28, unit: '°C' } },
};

const weather: Sensor = {
    name: 'Yard',
    type: 'WeatherApi',
    userId: 'alice',
    assetId: null,
    details: { threshold: { warning: 25, critical: 30 } },
};

describe('sensorStatus', () => {
    it('is "nodata" without readings', () => {
        expect(sensorStatus(opcua, undefined, now)).toBe('nodata');
    });

    it('is "stale" when the last reading is too old', () => {
        expect(sensorStatus(opcua, { timestamp: now - 5 * 60_000, value: 20, status: 'normal' }, now)).toBe('stale');
    });

    it('uses the status reported by the backend', () => {
        expect(sensorStatus(opcua, { timestamp: now, value: 29, status: 'critical' }, now)).toBe('critical');
    });

    it('falls back to the thresholds when no status was stored', () => {
        expect(sensorStatus(opcua, { timestamp: now, value: 26 }, now)).toBe('warning');
    });

    it('uses the temperature status for weather sensors', () => {
        expect(sensorStatus(weather, { timestamp: now, temp: 31, tempStatus: 'critical', humidity: 50 }, now)).toBe('critical');
    });
});

describe('evaluate', () => {
    it.each([
        [20, 'normal'],
        [25, 'normal'],
        [25.1, 'warning'],
        [28, 'warning'],
        [28.5, 'critical'],
    ])('%s → %s', (value, expected) => {
        expect(evaluate(opcua, value)).toBe(expected);
    });

    it.each([
        [4, 'critical'],
        [8, 'warning'],
        [10, 'normal'],
    ])('low limits: %s → %s', (value, expected) => {
        const sensor = { ...opcua, details: { threshold: { warning: 25, critical: 28, lowWarning: 10, lowCritical: 5 } } };
        expect(evaluate(sensor, value)).toBe(expected);
    });

    it('returns undefined without limits', () => {
        expect(evaluate({ ...opcua, details: {} }, 50)).toBeUndefined();
    });
});

describe('formatting', () => {
    it('formats values with unit', () => {
        expect(formatValue(24.3456, '°C')).toBe('24.35 °C');
        expect(formatValue(1012.6, 'hPa')).toBe('1013 hPa');
        expect(formatValue(undefined, '°C')).toBe('—');
    });

    it('formats ages', () => {
        expect(formatAge(now - 5_000, now)).toBe('5 s ago');
        expect(formatAge(now - 3 * 60_000, now)).toBe('3 min ago');
        expect(formatAge(now - 2 * 3600_000, now)).toBe('2 h ago');
    });
});
