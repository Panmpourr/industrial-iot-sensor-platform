import { conditionLabels } from './alarms';
import { roleLabels } from './roles';
import type { AlarmCondition, AuditChange, AuditEntry, Role } from './types';

export const actionLabels: Record<string, string> = {
    'user.login': 'Signed in',
    'user.password': 'Changed password',
    'user.password-reset': 'Reset password',
    'user.create': 'Added user',
    'user.role': 'Changed role',
    'user.delete': 'Removed user',
    'site.rename': 'Renamed site',
    'sensor.create': 'Added sensor',
    'sensor.update': 'Changed sensor',
    'sensor.delete': 'Deleted sensor',
    'asset.create': 'Added asset',
    'asset.update': 'Changed asset',
    'asset.delete': 'Deleted asset',
    'alarm.acknowledge': 'Acknowledged alarm',
};

/** Changes (sign-ins and password changes are not) — the default filter of the audit log. */
export const isChange = (entry: AuditEntry): boolean => entry.action !== 'user.login' && entry.action !== 'user.password';

const fieldLabels: Record<string, string> = {
    'threshold.warning': 'warning limit',
    'threshold.critical': 'critical limit',
    'threshold.lowWarning': 'low warning limit',
    'threshold.lowCritical': 'low critical limit',
    'threshold.deadband': 'deadband',
    'threshold.onDelay': 'on-delay (s)',
    'threshold.min': 'range min',
    'threshold.max': 'range max',
    'threshold.unit': 'unit',
    // Where a sensor or asset sits in the plant hierarchy
    asset: 'plant location',
    parent: 'plant location',
};

const label = (field: string) => fieldLabels[field] ?? field;

const display = (field: string, value: string | null) =>
    value === null ? '—' : field === 'role' && value in roleLabels ? roleLabels[value as Role] : value;

/** "critical limit: 90 → 95" */
export const describeChange = (c: AuditChange): string => `${label(c.field)}: ${display(c.field, c.from)} → ${display(c.field, c.to)}`;

/** Short text for the details column. */
export const describeDetails = (entry: AuditEntry): string => {
    const d = entry.details;
    if (!d) return '';
    if (d.changes) return d.changes.map(describeChange).join(', ');
    if (entry.action === 'alarm.acknowledge' && typeof d.condition === 'string') {
        return conditionLabels[d.condition as AlarmCondition] ?? d.condition;
    }
    if (typeof d.role === 'string') return `as ${roleLabels[d.role as Role] ?? d.role}`;
    if (typeof d.kind === 'string') {
        const unassigned = typeof d.sensorsUnassigned === 'number' && d.sensorsUnassigned > 0
            ? `, ${d.sensorsUnassigned} sensor(s) now unassigned` : '';
        return `${d.kind}${unassigned}`;
    }
    if (typeof d.type === 'string') return d.type;
    return '';
};

const csvCell = (value: string): string => {
    // A cell starting with = + - @ would run as a formula in Excel (CSV injection), e.g. a sensor named "=HYPERLINK(...)"
    const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The entries as CSV (UTC times, so the file is unambiguous wherever it is opened). */
export const auditCsv = (entries: AuditEntry[]): string => {
    const header = ['time_utc', 'user', 'action', 'target_type', 'target', 'details'];
    const rows = entries.map(e => [
        new Date(e.time).toISOString(), e.userId, actionLabels[e.action] ?? e.action, e.targetType, e.targetName ?? '', describeDetails(e),
    ]);
    return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
};
