import type { NotificationLogEntry } from './types';

// Helpers for notification rules and the delivery log.

/** Delays offered for a rule: 0 = as soon as the alarm is raised, otherwise an escalation. */
export const delayOptions = [0, 5, 10, 15, 30, 60, 120, 240];

export const delayLabel = (minutes: number): string => {
    if (minutes === 0) return 'At once';
    if (minutes < 60) return `After ${minutes} min unacknowledged`;
    const hours = minutes / 60;
    return `After ${hours} h unacknowledged`;
};

/** "critical alarms, at once" / "all alarms, if unacknowledged for 10 min" */
export const ruleSummary = (minPriority: string, delayMinutes: number): string =>
    `${minPriority === 'critical' ? 'critical alarms' : 'all alarms'}, ${delayMinutes === 0 ? 'at once' : `if unacknowledged for ${delayMinutes} min`}`;

export type DeliveryStatus = 'sent' | 'failed' | 'sending';

export const deliveryStatus = (entry: NotificationLogEntry): DeliveryStatus =>
    entry.sentAt ? 'sent' : entry.error ? 'failed' : 'sending';
