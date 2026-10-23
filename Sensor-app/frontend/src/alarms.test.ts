import { describe, expect, it } from 'vitest';
import { alarmCondition, applyAlarm, compareAlarms, formatDuration } from './alarms';
import type { Alarm } from './types';

const alarm = (overrides: Partial<Alarm>): Alarm => ({
    id: 'a1',
    sensorId: 's1',
    condition: 'HI',
    priority: 'warning',
    limit: 70,
    value: 75,
    raisedAt: 1_000,
    clearedAt: null,
    ackedAt: null,
    ackedBy: null,
    state: 'active-unacked',
    ...overrides,
});

describe('alarmCondition', () => {
    it('describes the crossed limit', () => {
        expect(alarmCondition(alarm({}), '°C')).toBe('> 70 °C');
        expect(alarmCondition(alarm({ condition: 'LOLO', limit: 5 }), 'bar')).toBe('< 5 bar');
        expect(alarmCondition(alarm({ condition: 'COMM', limit: null, value: null }))).toBe('No data received');
    });
});

describe('compareAlarms', () => {
    it('puts critical first, then unacknowledged, then newest', () => {
        const oldWarning = alarm({ id: 'old', raisedAt: 1 });
        const newWarning = alarm({ id: 'new', raisedAt: 2 });
        const acked = alarm({ id: 'acked', raisedAt: 3, ackedAt: 4, state: 'active-acked' });
        const critical = alarm({ id: 'crit', priority: 'critical', raisedAt: 0 });

        expect([oldWarning, acked, newWarning, critical].sort(compareAlarms).map(a => a.id))
            .toEqual(['crit', 'new', 'old', 'acked']);
    });
});

describe('applyAlarm', () => {
    it('adds new alarms, replaces changed ones and drops closed ones', () => {
        const open = [alarm({})];

        expect(applyAlarm(open, alarm({ id: 'a2' })).map(a => a.id)).toEqual(['a1', 'a2']);
        expect(applyAlarm(open, alarm({ ackedAt: 5, state: 'active-acked' }))[0].state).toBe('active-acked');
        expect(applyAlarm(open, alarm({ clearedAt: 5, ackedAt: 6, state: 'closed' }))).toEqual([]);
    });
});

describe('formatDuration', () => {
    it.each([
        [42_000, '42 s'],
        [5 * 60_000, '5 min'],
        [125 * 60_000, '2 h 5 min'],
        [50 * 3600_000, '2 d 2 h'],
    ])('%s ms → %s', (ms, expected) => {
        expect(formatDuration(ms)).toBe(expected);
    });
});
