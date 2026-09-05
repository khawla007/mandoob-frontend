import {
  CalendarClock,
  FileText,
  IdCard,
  LayoutDashboard,
  Settings,
  UserRound,
} from 'lucide-react';
import type { ShellNavGroup } from './nav-config';

export function buildEmployeeNav(slug: string): ShellNavGroup[] {
  const base = `/t/${encodeURIComponent(slug)}/employee`;
  return [
    {
      items: [
        {
          labelKey: 'overview',
          labelFallback: 'Overview',
          href: `${base}/dashboard`,
          icon: LayoutDashboard,
        },
        {
          labelKey: 'profile',
          labelFallback: 'My profile',
          href: `${base}/profile`,
          icon: UserRound,
        },
      ],
    },
    {
      labelKey: 'myRecords',
      labelFallback: 'My records',
      items: [
        {
          labelKey: 'visaAndEid',
          labelFallback: 'Visa & EID',
          href: `${base}/identity`,
          icon: IdCard,
        },
        {
          labelKey: 'documents',
          labelFallback: 'Documents',
          href: `${base}/documents`,
          icon: FileText,
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
          labelKey: 'settings',
          labelFallback: 'Settings',
          href: `${base}/settings`,
          icon: Settings,
        },
      ],
    },
  ];
}
