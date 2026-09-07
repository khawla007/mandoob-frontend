import {
  CalendarClock,
  FileText,
  IdCard,
  LayoutDashboard,
  Settings,
  UserRound,
  ListTodo,
  CalendarDays,
  MessagesSquare,
  Bell,
  Activity,
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
        { labelKey: 'tasks', labelFallback: 'Tasks', href: `${base}/tasks`, icon: ListTodo },
        {
          labelKey: 'calendar',
          labelFallback: 'Calendar',
          href: `${base}/calendar`,
          icon: CalendarDays,
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
