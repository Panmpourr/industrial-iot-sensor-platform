import type { Alarm, AlarmCondition, Status } from './types';

// Report periods and the figures computed from them.

export type PeriodKind = 'day' | 'week' | 'month';

export const periodKinds: { key: PeriodKind; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
];

export const isPeriodKind = (value: string | null): value is PeriodKind => periodKinds.some(p => p.key === value);

export interface Period {
    from: Date;
    /** Exclusive end */
    to: Date;
}

/** The day, week (Monday to Sunday, ISO 8601) or month containing `anchor`, in local time. */
export const periodOf = (kind: PeriodKind, anchor: Date): Period => {
    const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate();
    switch (kind) {
        case 'day':
            return { from: new Date(y, m, d), to: new Date(y, m, d + 1) };
        case 'week': {
            const monday = d - ((anchor.getDay() + 6) % 7);
            return { from: new Date(y, m, monday), to: new Date(y, m, monday + 7) };
        }
        case 'month':
            return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
    }
};

/** A date in the previous (-1) or next (+1) period. */
export const shiftPeriod = (kind: PeriodKind, anchor: Date, step: -1 | 1): Date => {
    const { from } = periodOf(kind, anchor);
    switch (kind) {
        case 'day': return new Date(from.getFullYear(), from.getMonth(), from.getDate() + step);
        case 'week': return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7 * step);
        case 'month': return new Date(from.getFullYear(), from.getMonth() + step, 1);
    }
};

/** "Mon 19 Oct 2026", "19 – 25 Oct 2026", "October 2026" */
export const periodLabel = (kind: PeriodKind, period: Period): string => {
    const { from } = period;
    const last = new Date(period.to.getTime() - 1);
    switch (kind) {
        case 'day':
            return from.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        case 'week':
            return `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
        case 'month':
            return from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
};

/** Local date as `YYYY-MM-DD`, for the URL. */
export const toDateParam = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const parseDateParam = (value: string | null): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * ISA-18.2 benchmarks for one operator: about 6 alarms an hour is very likely acceptable, and
 * more than 10 alarms in 10 minutes is an alarm flood.
 */
export const ACCEPTABLE_PER_HOUR = 6;
export const FLOOD_PER_10_MIN = 10;

export interface BadActor {
    sensorId: string;
    condition: AlarmCondition;
    priority: Status;
    count: number;
    /** Share of all alarms in the period, 0–1 */
    share: number;
}

export interface AlarmLoad {
    total: number;
    critical: number;
    /** Average alarms per hour over the part of the period that has passed. */
    perHour: number;
    /** Most alarms raised within one 10-minute interval. */
    peak10Min: number;
    /** Average time from raised to acknowledged; null when none was acknowledged. */
    avgAckSeconds: number | null;
    unacked: number;
    /** The alarms that occurred most often, which are usually worth fixing first. */
    badActors: BadActor[];
}

const TEN_MINUTES = 600_000;

/** Alarm statistics of a period from the alarms raised in it. `hours` is how long the period has run so far. */
export const alarmLoad = (alarms: Alarm[], hours: number, topCount = 5): AlarmLoad => {
    const perInterval = new Map<number, number>();
    const actors = new Map<string, BadActor>();
    let ackTotal = 0, acked = 0;

    for (const a of alarms) {
        const interval = Math.floor(a.raisedAt / TEN_MINUTES);
        perInterval.set(interval, (perInterval.get(interval) ?? 0) + 1);
        if (a.ackedAt !== null) {
            ackTotal += (a.ackedAt - a.raisedAt) / 1000;
            acked++;
        }
        const key = `${a.sensorId}|${a.condition}`;
        const actor = actors.get(key) ?? { sensorId: a.sensorId, condition: a.condition, priority: a.priority, count: 0, share: 0 };
        actor.count++;
        if (a.priority === 'critical') actor.priority = 'critical';
        actors.set(key, actor);
    }

    const total = alarms.length;
    return {
        total,
        critical: alarms.filter(a => a.priority === 'critical').length,
        perHour: hours > 0 ? total / hours : 0,
        peak10Min: Math.max(0, ...perInterval.values()),
        avgAckSeconds: acked > 0 ? ackTotal / acked : null,
        unacked: alarms.filter(a => a.ackedAt === null).length,
        badActors: [...actors.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, topCount)
            .map(a => ({ ...a, share: a.count / total })),
    };
};

/** A CSV field, quoted when it contains a separator, quote or line break. */
export const csvField = (value: string | number | null | undefined): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (rows: (string | number | null | undefined)[][]): string =>
    rows.map(row => row.map(csvField).join(',')).join('\r\n') + '\r\n';
