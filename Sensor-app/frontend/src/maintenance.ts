import { subtreeIds } from './assets';
import { parseDateParam, toDateParam } from './reports';
import type { Asset, MaintenanceKind, MaintenanceTask } from './types';

// Helpers for maintenance tasks and the work log. Dates are plant calendar days ("yyyy-MM-dd").

export const kindLabels: Record<MaintenanceKind, string> = {
    preventive: 'Preventive',
    repair: 'Repair',
    inspection: 'Inspection',
    calibration: 'Calibration',
    other: 'Other',
};

/** Work logged by hand (preventive work is logged by marking a task done). */
export const manualKinds: MaintenanceKind[] = ['repair', 'inspection', 'calibration', 'preventive', 'other'];

/** A task is "due soon" this many days ahead. */
export const SOON_DAYS = 7;

export const intervalPresets = [
    { days: 1, label: 'Every day' },
    { days: 7, label: 'Every week' },
    { days: 14, label: 'Every 2 weeks' },
    { days: 30, label: 'Every month (30 days)' },
    { days: 91, label: 'Every 3 months (91 days)' },
    { days: 182, label: 'Every 6 months (182 days)' },
    { days: 365, label: 'Every year' },
];

export const intervalText = (days: number): string =>
    intervalPresets.find(p => p.days === days)?.label.replace(/ \(.*\)$/, '')
    ?? (days % 7 === 0 ? `Every ${days / 7} weeks` : `Every ${days} days`);

/** Today in local time, as "yyyy-MM-dd". */
export const todayText = (now = Date.now()): string => toDateParam(new Date(now));

export const addDays = (date: string, days: number): string => {
    const d = parseDateParam(date)!;
    return toDateParam(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
};

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number =>
    Math.round((parseDateParam(to)!.getTime() - parseDateParam(from)!.getTime()) / 86_400_000);

export type DueStatus = 'overdue' | 'soon' | 'ok';

export const dueStatus = (nextDue: string, today: string): DueStatus => {
    const days = daysBetween(today, nextDue);
    return days < 0 ? 'overdue' : days <= SOON_DAYS ? 'soon' : 'ok';
};

/** "3 days overdue", "Due today", "Due tomorrow", "Due in 5 days" */
export const dueText = (nextDue: string, today: string): string => {
    const days = daysBetween(today, nextDue);
    if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `Due in ${days} days`;
};

/** "Mon 2 Nov 2026" */
export const formatDay = (date: string): string =>
    parseDateParam(date)?.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) ?? date;

/** Tasks most urgent first: overdue, then by due date. */
export const byDue = (a: MaintenanceTask, b: MaintenanceTask): number =>
    a.nextDue.localeCompare(b.nextDue) || a.name.localeCompare(b.name);

/** Overdue tasks of each asset, counting everything below an area too (for the plant tree). */
export const overdueByAsset = (assets: Asset[], tasks: MaintenanceTask[], today: string): Map<string, number> => {
    const overdue = tasks.filter(t => dueStatus(t.nextDue, today) === 'overdue');
    return new Map(assets.map(a => {
        const ids = subtreeIds(assets, a.id);
        return [a.id, overdue.filter(t => ids.has(t.assetId)).length];
    }));
};

/** "45 min", "2 h", "1 h 30 min" */
export const formatMinutes = (minutes: number | null): string => {
    if (minutes === null) return '—';
    if (minutes < 60) return `${minutes} min`;
    return minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`;
};
