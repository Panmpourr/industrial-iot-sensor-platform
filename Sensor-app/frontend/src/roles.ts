import type { Role } from './types';

const order: Role[] = ['operator', 'engineer', 'admin'];

/** Same rule as the backend: each role can do everything the previous one can. */
export const atLeast = (role: Role, required: Role): boolean => order.indexOf(role) >= order.indexOf(required);

export const roles = order;

export const roleLabels: Record<Role, string> = {
    operator: 'Operator',
    engineer: 'Engineer',
    admin: 'Admin',
};

export const roleDescriptions: Record<Role, string> = {
    operator: 'Views data and acknowledges alarms',
    engineer: 'Also adds and edits sensors and alarm limits',
    admin: 'Also manages users',
};
