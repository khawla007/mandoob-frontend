export const ROLES = ['super_admin', 'admin', 'pro', 'customer', 'employee'] as const;
export type Role = (typeof ROLES)[number];

export function isPlatformOperatorRole(
  role: Role | null | undefined,
): role is 'admin' | 'super_admin' {
  return role === 'admin' || role === 'super_admin';
}
