import { describe, expect, it } from 'vitest';
import { assignSlots, groupByUnit, MAX_SERIES, parseSensorIds, percentOf, spanOf, trendsLink } from './trends';
import type { HistoryPoint, Sensor } from './types';

const sensor = (unit: string, min?: number, max?: number): Sensor => ({
    name: unit || 'no unit', type: 'Plc-Opcua', assetId: null,
    details: { threshold: { unit, min, max } },
} as Sensor);

const point = (min: number, max: number): HistoryPoint => ({ t: 0, min, avg: (min + max) / 2, max, count: 1, status: 'normal' });

describe('parseSensorIds', () => {
    it('drops blanks and repeats and caps the count', () => {
        expect(parseSensorIds(null)).toEqual([]);
        expect(parseSensorIds('a,,b, a ,c')).toEqual(['a', 'b', 'c']);
        expect(parseSensorIds(Array.from({ length: 12 }, (_, i) => `s${i}`).join(','))).toHaveLength(MAX_SERIES);
    });
});

describe('assignSlots', () => {
    it('gives new sensors the next slots in order', () => {
        expect(assignSlots({}, ['a', 'b', 'c'])).toEqual({ a: 0, b: 1, c: 2 });
    });

    it('keeps the colours of the remaining sensors when one is removed', () => {
        const before = assignSlots({}, ['a', 'b', 'c']);

        expect(assignSlots(before, ['a', 'c'])).toEqual({ a: 0, c: 2 });
    });

    it('fills the freed slot first', () => {
        expect(assignSlots({ a: 0, c: 2 }, ['a', 'c', 'd', 'e'])).toEqual({ a: 0, c: 2, d: 1, e: 3 });
    });
});

describe('spanOf', () => {
    it('uses the configured range', () => {
        expect(spanOf(sensor('°C', 0, 200), [point(20, 30)])).toEqual({ min: 0, max: 200, observed: false });
    });

    it('falls back to the range the data covered', () => {
        expect(spanOf(sensor('bar'), [point(2, 3), point(1, 5)])).toEqual({ min: 1, max: 5, observed: true });
        expect(spanOf(sensor('bar'), [])).toBeNull();
    });

    it('widens a flat line so it can still be scaled', () => {
        expect(spanOf(sensor('bar'), [point(4, 4)])).toEqual({ min: 3, max: 5, observed: true });
    });
});

describe('percentOf', () => {
    it('places a value within its span', () => {
        expect(percentOf(50, { min: 0, max: 200, observed: false })).toBe(25);
    });
});

describe('groupByUnit', () => {
    it('groups sensors by unit in the order they were added', () => {
        const series = [sensor('°C'), sensor('%'), sensor('°C')].map(s => ({ sensor: s }));

        expect(groupByUnit(series).map(([unit, items]) => [unit, items.length])).toEqual([['°C', 2], ['%', 1]]);
    });
});

describe('trendsLink', () => {
    it('lists the sensors and keeps the range', () => {
        expect(trendsLink(['a', 'b'], '7d')).toBe('/trends?sensors=a,b&range=7d');
    });
});
