import { describe, expect, it } from 'vitest';
import { alarmLoad, parseDateParam, periodOf, shiftPeriod, toCsv, toDateParam } from './reports';
import type { Alarm, AlarmCondition, Status } from './types';

const MIN = 60_000;

const alarm = (sensorId: string, condition: AlarmCondition, raisedAt: number, ackedAfter: number | null = null, priority: Status = 'warning'): Alarm => ({
    id: `${sensorId}-${raisedAt}`, sensorId, condition, priority, limit: null, value: null,
    raisedAt, clearedAt: null, ackedAt: ackedAfter === null ? null : raisedAt + ackedAfter, ackedBy: null, state: 'active-unacked',
});

describe('periodOf', () => {
    // Wednesday 21 October 2026, afternoon
    const wednesday = new Date(2026, 9, 21, 15, 30);

    it('covers the whole local day', () => {
        expect(periodOf('day', wednesday)).toEqual({ from: new Date(2026, 9, 21), to: new Date(2026, 9, 22) });
    });

    it('runs weeks from Monday to Sunday', () => {
        expect(periodOf('week', wednesday)).toEqual({ from: new Date(2026, 9, 19), to: new Date(2026, 9, 26) });
        // A Sunday still belongs to the week that started the Monday before
        expect(periodOf('week', new Date(2026, 9, 25)).from).toEqual(new Date(2026, 9, 19));
    });

    it('covers the calendar month', () => {
        expect(periodOf('month', wednesday)).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) });
    });
});

describe('shiftPeriod', () => {
    it('steps to the neighbouring period', () => {
        const day = new Date(2026, 9, 21);

        expect(shiftPeriod('day', day, -1)).toEqual(new Date(2026, 9, 20));
        expect(shiftPeriod('week', day, 1)).toEqual(new Date(2026, 9, 26));
        expect(shiftPeriod('month', new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 1));
        expect(shiftPeriod('month', new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 1));
    });
});

describe('date params', () => {
    it('round-trips a local date', () => {
        expect(toDateParam(new Date(2026, 2, 5))).toBe('2026-03-05');
        expect(parseDateParam('2026-03-05')).toEqual(new Date(2026, 2, 5));
    });

    it('ignores anything else', () => {
        expect(parseDateParam(null)).toBeNull();
        expect(parseDateParam('yesterday')).toBeNull();
    });
});

describe('alarmLoad', () => {
    it('counts the alarms and their rate', () => {
        const load = alarmLoad([
            alarm('oven', 'HI', 0, 2 * MIN),
            alarm('oven', 'HI', 3 * MIN, 4 * MIN),
            alarm('fan', 'HIHI', 30 * MIN, null, 'critical'),
        ], 2);

        expect(load).toMatchObject({ total: 3, critical: 1, perHour: 1.5, unacked: 1, avgAckSeconds: 180 });
    });

    it('finds the busiest 10 minutes', () => {
        const load = alarmLoad([alarm('a', 'HI', 0), alarm('a', 'HI', 5 * MIN), alarm('a', 'HI', 9 * MIN), alarm('a', 'HI', 25 * MIN)], 1);

        expect(load.peak10Min).toBe(3);
    });

    it('ranks the most frequent alarms first', () => {
        const load = alarmLoad([
            alarm('fan', 'HI', 0),
            alarm('oven', 'HI', MIN),
            alarm('oven', 'HI', 2 * MIN),
            alarm('oven', 'HIHI', 3 * MIN, null, 'critical'),
        ], 1, 2);

        expect(load.badActors).toEqual([
            { sensorId: 'oven', condition: 'HI', priority: 'warning', count: 2, share: 0.5 },
            { sensorId: 'fan', condition: 'HI', priority: 'warning', count: 1, share: 0.25 },
        ]);
    });

    it('is empty without alarms', () => {
        expect(alarmLoad([], 24)).toMatchObject({ total: 0, perHour: 0, peak10Min: 0, avgAckSeconds: null, badActors: [] });
    });
});

describe('toCsv', () => {
    it('quotes only where needed', () => {
        expect(toCsv([['Sensor', 'Min'], ['Oven, left', 1.5], ['Say "hi"', null]]))
            .toBe('Sensor,Min\r\n"Oven, left",1.5\r\n"Say ""hi""",\r\n');
    });
});
