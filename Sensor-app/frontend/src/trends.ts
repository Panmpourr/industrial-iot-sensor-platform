import { unitOf } from './status';
import type { HistoryPoint, Sensor } from './types';

// Helpers for comparing several sensors in one trend.

/**
 * Series colours, in a fixed order checked for colour-blind separation on the dark panels.
 * Assigned in this order and never cycled, so at most this many sensors are compared at once.
 */
export const seriesColors = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export const MAX_SERIES = seriesColors.length;

/** `?sensors=a,b,c` → ids, without blanks or repeats, at most {@link MAX_SERIES}. */
export const parseSensorIds = (param: string | null): string[] =>
    [...new Set((param ?? '').split(',').map(id => id.trim()).filter(Boolean))].slice(0, MAX_SERIES);

/**
 * Colour slot of each sensor. Sensors keep their slot while others are added or removed (a colour
 * follows its sensor, not its position); new ones take the lowest free slot.
 */
export const assignSlots = (previous: Record<string, number>, ids: string[]): Record<string, number> => {
    const slots: Record<string, number> = {};
    const used = new Set<number>();
    for (const id of ids) {
        const slot = previous[id];
        if (slot !== undefined && !used.has(slot)) {
            slots[id] = slot;
            used.add(slot);
        }
    }
    for (const id of ids) {
        if (slots[id] !== undefined) continue;
        let slot = 0;
        while (used.has(slot)) slot++;
        slots[id] = slot;
        used.add(slot);
    }
    return slots;
};

export interface Span {
    min: number;
    max: number;
    /** true when the sensor has no configured range and the span is what the data covered. */
    observed: boolean;
}

/** The range a sensor's values are scaled to for "% of range": its configured min–max, else the data's. */
export const spanOf = (sensor: Sensor, points: HistoryPoint[]): Span | null => {
    const { min, max } = sensor.details.threshold ?? {};
    if (typeof min === 'number' && typeof max === 'number' && max > min) return { min, max, observed: false };
    if (points.length === 0) return null;
    const low = Math.min(...points.map(p => p.min));
    const high = Math.max(...points.map(p => p.max));
    return high > low ? { min: low, max: high, observed: true } : { min: low - 1, max: high + 1, observed: true };
};

export const percentOf = (value: number, span: Span): number => ((value - span.min) / (span.max - span.min)) * 100;

/** Sensors grouped by unit, in the order the units first appear: one chart per unit, so each chart has one y-axis. */
export const groupByUnit = <T extends { sensor: Sensor }>(series: T[]): [string, T[]][] => {
    const groups = new Map<string, T[]>();
    for (const s of series) {
        const unit = unitOf(s.sensor);
        groups.set(unit, [...(groups.get(unit) ?? []), s]);
    }
    return [...groups];
};

/** Link to the trends page comparing the given sensors (the first {@link MAX_SERIES}). */
export const trendsLink = (sensorIds: string[], range?: string): string => {
    const params = new URLSearchParams({ sensors: sensorIds.slice(0, MAX_SERIES).join(',') });
    if (range) params.set('range', range);
    return `/trends?${params.toString().replaceAll('%2C', ',')}`;
};
