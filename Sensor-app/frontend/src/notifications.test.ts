import { describe, expect, it } from 'vitest';
import { delayLabel, deliveryStatus, ruleSummary } from './notifications';
import type { NotificationLogEntry } from './types';

const entry = (sentAt: string | null, error: string | null) => ({ sentAt, error } as NotificationLogEntry);

describe('delayLabel', () => {
    it('describes immediate rules and escalations', () => {
        expect(delayLabel(0)).toBe('At once');
        expect(delayLabel(10)).toBe('After 10 min unacknowledged');
        expect(delayLabel(120)).toBe('After 2 h unacknowledged');
    });
});

describe('ruleSummary', () => {
    it('names the priority and when', () => {
        expect(ruleSummary('critical', 0)).toBe('critical alarms, at once');
        expect(ruleSummary('warning', 15)).toBe('all alarms, if unacknowledged for 15 min');
    });
});

describe('deliveryStatus', () => {
    it('tells sent, failed and pending apart', () => {
        expect(deliveryStatus(entry('2026-10-26T10:00:00Z', null))).toBe('sent');
        expect(deliveryStatus(entry(null, 'Telegram is not connected for this user'))).toBe('failed');
        expect(deliveryStatus(entry(null, null))).toBe('sending');
    });
});
