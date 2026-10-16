import type { HistoryPoint, Status } from './types';

/** Time ranges offered above the trend. "live" streams readings over SignalR. */
export const ranges = [
    { key: 'live', label: 'Live', ms: 0 },
    { key: '1h', label: '1h', ms: 3_600_000 },
    { key: '24h', label: '24h', ms: 86_400_000 },
    { key: '7d', label: '7d', ms: 7 * 86_400_000 },
    { key: '30d', label: '30d', ms: 30 * 86_400_000 },
    { key: '1y', label: '1y', ms: 365 * 86_400_000 },
] as const;

export type RangeKey = (typeof ranges)[number]['key'];

export const isRangeKey = (value: string | null): value is RangeKey => ranges.some(r => r.key === value);

/** A missing bucket in a chart series; the line is broken there instead of bridging the gap. */
export type ChartPoint = HistoryPoint | null;

/**
 * Inserts a `null` wherever the time between two buckets is more than twice the bucket size,
 * so periods without data (sensor offline, backend stopped) show as gaps in the trend.
 */
export const withGaps = (points: HistoryPoint[], bucketMs: number): ChartPoint[] => {
    const result: ChartPoint[] = [];
    points.forEach((point, i) => {
        if (i > 0 && point.t - points[i - 1].t > 2 * bucketMs) result.push(null);
        result.push(point);
    });
    return result;
};

const statusRank: Record<Status, number> = { normal: 0, warning: 1, critical: 2 };

export interface HistorySummary {
    min: number;
    max: number;
    /** Average over all readings, weighted by how many readings each bucket holds. */
    avg: number;
    count: number;
    worst: Status;
    /** Time spent outside limits, counted in buckets that reached warning or critical. */
    abnormalBuckets: number;
}

export const summarize = (points: HistoryPoint[]): HistorySummary | null => {
    if (points.length === 0) return null;
    let min = Infinity, max = -Infinity, sum = 0, count = 0, worst: Status = 'normal', abnormalBuckets = 0;
    for (const p of points) {
        min = Math.min(min, p.min);
        max = Math.max(max, p.max);
        sum += p.avg * p.count;
        count += p.count;
        if (statusRank[p.status] > statusRank[worst]) worst = p.status;
        if (p.status !== 'normal') abnormalBuckets++;
    }
    return { min, max, avg: count > 0 ? sum / count : NaN, count, worst, abnormalBuckets };
};

/** Human-readable bucket size, e.g. "10 s", "5 min", "2 h", "1 d". */
export const formatBucket = (seconds: number): string => {
    if (seconds % 86_400 === 0) return `${seconds / 86_400} d`;
    if (seconds % 3_600 === 0) return `${seconds / 3_600} h`;
    if (seconds % 60 === 0) return `${seconds / 60} min`;
    return `${seconds} s`;
};

/** Axis label for a bucket start: time of day for short ranges, the date for long ones. */
export const formatTick = (t: number, rangeMs: number): string => {
    const date = new Date(t);
    if (rangeMs <= 86_400_000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (rangeMs <= 7 * 86_400_000) return date.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
