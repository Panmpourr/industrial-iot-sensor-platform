import { describe, expect, it } from 'vitest';
import { appendReading, MAX_READINGS } from './realtime';
import { numericValue, type Reading } from './types';

const reading = (timestamp: number, value = 1): Reading => ({ timestamp, value });

describe('appendReading', () => {
    it('appends a newer reading', () => {
        const history = [reading(1), reading(2)];

        expect(appendReading(history, reading(3))).toEqual([reading(1), reading(2), reading(3)]);
    });

    it('ignores duplicates and out-of-order readings', () => {
        const history = [reading(1), reading(5)];

        expect(appendReading(history, reading(5))).toBe(history);
        expect(appendReading(history, reading(3))).toBe(history);
    });

    it('ignores readings until the history has been loaded', () => {
        expect(appendReading(undefined, reading(1))).toBeUndefined();
    });

    it(`keeps at most ${MAX_READINGS} readings`, () => {
        const history = Array.from({ length: MAX_READINGS }, (_, i) => reading(i));

        const next = appendReading(history, reading(MAX_READINGS))!;

        expect(next).toHaveLength(MAX_READINGS);
        expect(next[0].timestamp).toBe(1);
        expect(next[next.length - 1].timestamp).toBe(MAX_READINGS);
    });
});

describe('numericValue', () => {
    it('returns numbers and skips text or boolean OPC UA values', () => {
        expect(numericValue({ timestamp: 1, value: 21.5 })).toBe(21.5);
        expect(numericValue({ timestamp: 1, value: 'RUNNING' })).toBeUndefined();
        expect(numericValue({ timestamp: 1, value: true })).toBeUndefined();
        expect(numericValue({ timestamp: 1, temp: 20 })).toBeUndefined();
    });
});
