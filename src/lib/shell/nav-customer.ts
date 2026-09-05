import {
  CalendarClock,
  FileText,
  LayoutDashboard,
  ShieldAlert,
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
          labelKey: 'documents',
          labelFallback: 'Documents',
          href: `${base}/documents`,
          icon: FileText,
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
