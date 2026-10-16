import { describe, expect, it } from 'vitest';
import { formatBucket, isRangeKey, summarize, withGaps } from './history';
import type { HistoryPoint, Status } from './types';

const point = (t: number, avg: number, count = 1, status: Status = 'normal'): HistoryPoint =>
    ({ t, min: avg - 1, avg, max: avg + 1, count, status });

describe('withGaps', () => {
    it('keeps consecutive buckets together', () => {
        const points = [point(0, 1), point(10, 2), point(20, 3)];

        expect(withGaps(points, 10)).toEqual(points);
    });

    it('breaks the line where buckets are missing', () => {
        const points = [point(0, 1), point(10, 2), point(100, 3)];

        expect(withGaps(points, 10)).toEqual([point(0, 1), point(10, 2), null, point(100, 3)]);
    });
});

describe('summarize', () => {
    it('returns null without data', () => {
        expect(summarize([])).toBeNull();
    });

    it('weights the average by readings per bucket and finds the extremes', () => {
        const summary = summarize([point(0, 10, 1), point(10, 20, 3, 'warning'), point(20, 15, 1, 'critical')]);

        expect(summary).toMatchObject({ min: 9, max: 21, count: 5, worst: 'critical', abnormalBuckets: 2 });
        expect(summary?.avg).toBeCloseTo((10 + 60 + 15) / 5);
    });
});

describe('formatBucket', () => {
    it.each([[10, '10 s'], [300, '5 min'], [7200, '2 h'], [86400, '1 d']])('%i s → %s', (seconds, text) => {
        expect(formatBucket(seconds)).toBe(text);
    });
});

describe('isRangeKey', () => {
    it('accepts known ranges only', () => {
        expect(isRangeKey('24h')).toBe(true);
        expect(isRangeKey('2h')).toBe(false);
        expect(isRangeKey(null)).toBe(false);
    });
});
