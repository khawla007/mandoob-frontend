import {
  Building2,
  CalendarClock,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  UserCheck,
  UserRound,
  Users,
  Video,
  Route,
  ListTodo,
  CalendarDays,
  MessagesSquare,
  Bell,
  Activity,
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
          labelKey: 'registration',
          labelFallback: 'Registration',
          href: `${base}/registration`,
          icon: Route,
        },
        { labelKey: 'tasks', labelFallback: 'Tasks', href: `${base}/tasks`, icon: ListTodo },
        {
          labelKey: 'calendar',
          labelFallback: 'Calendar',
          href: `${base}/calendar`,
          icon: CalendarDays,
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
          labelKey: 'payments',
          labelFallback: 'Payments',
          href: `${base}/payments`,
          icon: CircleDollarSign,
        },
        {
          labelKey: 'renewals',
          labelFallback: 'Renewals',
          href: `${base}/renewals`,
          icon: CalendarClock,
        },
        {
          labelKey: 'communications',
          labelFallback: 'Communications',
          href: `${base}/communications`,
          icon: MessagesSquare,
        },
        {
          labelKey: 'notifications',
          labelFallback: 'Notifications',
          href: `${base}/notifications`,
          icon: Bell,
        },
        {
          labelKey: 'activity',
          labelFallback: 'Activity',
          href: `${base}/activity`,
          icon: Activity,
        },
        {
          labelKey: 'assignedPro',
          labelFallback: 'Assigned PRO',
          href: `${base}/pro`,
          icon: UserCheck,
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
