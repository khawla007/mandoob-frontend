import type { Role } from '@/lib/auth/roles';

export type TabDef = { href: string; label: string; visibleFor: Role[] };

export const TABS: TabDef[] = [
  {
    href: '/account',
    label: 'Profile',
    visibleFor: ['super_admin', 'admin', 'pro', 'customer', 'employee'],
  },
  {
    href: '/account/security',
    label: 'Security',
    visibleFor: ['super_admin', 'admin', 'pro', 'customer', 'employee'],
  },
  { href: '/account/role', label: 'Role details', visibleFor: ['pro', 'customer', 'employee'] },
];

export function visibleTabs(role: Role): TabDef[] {
  return TABS.filter((t) => t.visibleFor.includes(role));
}
