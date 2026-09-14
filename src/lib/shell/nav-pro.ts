import {
  BadgeCheck,
  Building2,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Settings,
  Route,
  ListTodo,
  CalendarDays,
  MessagesSquare,
  Bell,
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
          labelKey: 'registration',
          labelFallback: 'Registration',
          href: `${base}/applications/registration`,
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
