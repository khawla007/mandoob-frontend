import {
  Building2,
  CalendarClock,
  CreditCard,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  UserCheck,
  Users,
  UserRound,
  Video,
} from 'lucide-react';

import type { ShellNavGroup } from './nav-config';

export function buildCustomerNav(slug: string): ShellNavGroup[] {
  const base = `/t/${encodeURIComponent(slug)}/portal`;

  return [
    {
      items: [
        {
          labelKey: 'overview',
          labelFallback: 'Overview',
          href: base,
          icon: LayoutDashboard,
        },
      ],
    },
    {
      labelKey: 'companyPortal',
      labelFallback: 'Company portal',
      items: [
        {
          labelKey: 'company',
          labelFallback: 'Company',
          href: `${base}/company`,
          icon: Building2,
        },
        {
          labelKey: 'documents',
          labelFallback: 'Documents',
          href: `${base}/documents`,
          icon: FileText,
        },
        {
          labelKey: 'employees',
          labelFallback: 'Employees',
          href: `${base}/employees`,
          icon: Users,
        },
        {
          labelKey: 'meetings',
          labelFallback: 'Meetings',
          href: `${base}/meetings`,
          icon: Video,
        },
        {
          labelKey: 'renewals',
          labelFallback: 'Renewals',
          href: `${base}/renewals`,
          icon: CalendarClock,
        },
        {
          labelKey: 'payments',
          labelFallback: 'Payments',
          href: `${base}/payments`,
          icon: CreditCard,
        },
        {
          labelKey: 'assignedPro',
          labelFallback: 'Assigned PRO',
          href: `${base}/pro`,
          icon: UserCheck,
        },
        {
          labelKey: 'settings',
          labelFallback: 'Settings',
          href: `${base}/settings`,
          icon: Settings,
        },
      ],
    },
    {
      labelKey: 'account',
      labelFallback: 'Account',
      items: [
        {
          labelKey: 'profile',
          labelFallback: 'Profile',
          href: '/account',
          icon: UserRound,
        },
        {
          labelKey: 'erasure',
          labelFallback: 'Data erasure',
          href: `${base}/account/erasure`,
          icon: ShieldAlert,
        },
      ],
    },
  ];
}
