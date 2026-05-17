import {
  BadgeCheck,
  CalendarClock,
  Columns3,
  CreditCard,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import type { ShellNavGroup } from './nav-config';

export function buildProNav(slug: string): ShellNavGroup[] {
  const base = `/t/${slug}`;
  return [
    {
      items: [
        {
          labelKey: 'overview',
          labelFallback: 'Overview',
          href: `${base}/dashboard`,
          icon: LayoutDashboard,
        },
      ],
    },
    {
      labelKey: 'workspace',
      labelFallback: 'Workspace',
      items: [
        { labelKey: 'clients', labelFallback: 'Clients', href: `${base}/clients`, icon: Users },
        { labelKey: 'leads', labelFallback: 'Leads', href: `${base}/leads`, icon: Columns3 },
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
