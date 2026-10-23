import { describe, expect, it } from 'vitest';
import { describeDetails, isChange } from './audit';
import { atLeast } from './roles';
import type { AuditEntry } from './types';

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
    id: 'e1',
    time: 0,
    userId: 'eng',
    action: 'sensor.update',
    targetType: 'sensor',
    targetId: 's1',
    targetName: 'Oven',
    details: null,
    ...overrides,
});

describe('atLeast', () => {
    it('gives each role the rights of the lower ones', () => {
        expect(atLeast('admin', 'engineer')).toBe(true);
        expect(atLeast('engineer', 'engineer')).toBe(true);
        expect(atLeast('operator', 'engineer')).toBe(false);
        expect(atLeast('engineer', 'admin')).toBe(false);
    });
});

describe('describeDetails', () => {
    it('lists changed limits with readable names', () => {
        const details = { changes: [{ field: 'threshold.critical', from: '90', to: '95' }, { field: 'name', from: 'A', to: 'B' }] };

        expect(describeDetails(entry({ details }))).toBe('critical limit: 90 → 95, name: A → B');
    });

    it('shows role changes with role names and missing values as a dash', () => {
        const details = { changes: [{ field: 'role', from: 'operator', to: 'engineer' }, { field: 'location', from: 'X', to: null }] };

        expect(describeDetails(entry({ action: 'user.role', details }))).toBe('role: Operator → Engineer, location: X → —');
    });

    it('names the acknowledged alarm condition and the new user role', () => {
        expect(describeDetails(entry({ action: 'alarm.acknowledge', details: { condition: 'HIHI', priority: 'critical' } }))).toBe('High-high');
        expect(describeDetails(entry({ action: 'user.create', details: { role: 'operator' } }))).toBe('as Operator');
    });
});

describe('isChange', () => {
    it('hides sign-ins and password changes by default', () => {
        expect(isChange(entry({ action: 'user.login' }))).toBe(false);
        expect(isChange(entry({ action: 'user.password' }))).toBe(false);
        expect(isChange(entry({ action: 'sensor.delete' }))).toBe(true);
    });
});
