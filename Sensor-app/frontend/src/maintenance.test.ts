import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, dueStatus, dueText, formatMinutes, intervalText, overdueByAsset, todayText } from './maintenance';
import type { Asset, MaintenanceTask } from './types';

const task = (assetId: string, nextDue: string): MaintenanceTask =>
    ({ id: `${assetId}-${nextDue}`, assetId, name: 'Filter', intervalDays: 30, nextDue, notes: null, lastDone: null });

describe('dates', () => {
    it('adds days across month and year ends', () => {
        expect(addDays('2026-10-20', 30)).toBe('2026-11-19');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('counts whole days, also over a daylight saving change', () => {
        expect(daysBetween('2026-10-20', '2026-11-19')).toBe(30);
        expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
        expect(daysBetween('2026-10-26', '2026-10-24')).toBe(-2);
    });

    it('takes today in local time', () => {
        expect(todayText(new Date(2026, 9, 26, 23, 30).getTime())).toBe('2026-10-26');
    });
});

describe('dueStatus and dueText', () => {
    const today = '2026-10-26';

    it('flags overdue and soon-due tasks', () => {
        expect(dueStatus('2026-10-25', today)).toBe('overdue');
        expect(dueStatus('2026-10-26', today)).toBe('soon');
        expect(dueStatus('2026-11-02', today)).toBe('soon');
        expect(dueStatus('2026-11-03', today)).toBe('ok');
    });

    it('says how far away the date is', () => {
        expect(dueText('2026-10-23', today)).toBe('3 days overdue');
        expect(dueText('2026-10-25', today)).toBe('1 day overdue');
        expect(dueText('2026-10-26', today)).toBe('Due today');
        expect(dueText('2026-10-27', today)).toBe('Due tomorrow');
        expect(dueText('2026-11-05', today)).toBe('Due in 10 days');
    });
});

describe('intervalText', () => {
    it('names common intervals', () => {
        expect(intervalText(7)).toBe('Every week');
        expect(intervalText(30)).toBe('Every month');
        expect(intervalText(21)).toBe('Every 3 weeks');
        expect(intervalText(45)).toBe('Every 45 days');
    });
});

describe('overdueByAsset', () => {
    it('counts overdue tasks of an asset and everything below it', () => {
        const assets: Asset[] = [
            { id: 'hall', parentId: null, name: 'Hall', kind: 'area' },
            { id: 'oven', parentId: 'hall', name: 'Oven', kind: 'equipment' },
            { id: 'press', parentId: null, name: 'Press', kind: 'equipment' },
        ];
        const counts = overdueByAsset(assets, [task('oven', '2026-10-01'), task('oven', '2026-12-01'), task('press', '2026-10-20')], '2026-10-26');

        expect(counts.get('oven')).toBe(1);
        expect(counts.get('hall')).toBe(1);
        expect(counts.get('press')).toBe(1);
    });
});

describe('formatMinutes', () => {
    it('uses hours for long jobs', () => {
        expect(formatMinutes(null)).toBe('—');
        expect(formatMinutes(45)).toBe('45 min');
        expect(formatMinutes(120)).toBe('2 h');
        expect(formatMinutes(90)).toBe('1 h 30 min');
    });
});
