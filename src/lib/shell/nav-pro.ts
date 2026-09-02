import {
  BadgeCheck,
  Building2,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import type { ShellNavGroup } from './nav-config';

export function buildProNav(slug: string): ShellNavGroup[] {
  const base = `/t/${slug}`;
  return [
    {
      items: [
        {
          labelKey: 'commandCenter',
          labelFallback: 'Command Center',
          href: `${base}/dashboard`,
          icon: LayoutDashboard,
        },
      ],
    },
    {
      labelKey: 'workspace',
      labelFallback: 'Workspace',
      items: [
        {
          labelKey: 'assignedCompany',
          labelFallback: 'Assigned Company',
          href: `${base}/company`,
          icon: Building2,
        },
        {
          labelKey: 'applications',
          labelFallback: 'Applications',
          href: `${base}/applications`,
          icon: ClipboardList,
        },
        {
          labelKey: 'meetings',
          labelFallback: 'Meetings',
          href: `${base}/meetings`,
          icon: CalendarClock,
        },
        {
          labelKey: 'renewals',
          labelFallback: 'Renewals',
          href: `${base}/renewals`,
          icon: CalendarClock,
        },
        {
          labelKey: 'documents',
          labelFallback: 'Documents',
          href: `${base}/documents`,
          icon: FileText,
        },
        {
          labelKey: 'payments',
          labelFallback: 'Payments',
          href: `${base}/payments`,
          icon: CreditCard,
        },
        {
          labelKey: 'employees',
          labelFallback: 'Employees',
          href: `${base}/employees`,
          icon: BadgeCheck,
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
