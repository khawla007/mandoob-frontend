export const ROLES = ['super_admin', 'admin', 'pro', 'customer', 'employee'] as const;
export type Role = (typeof ROLES)[number];
