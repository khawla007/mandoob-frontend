import {
  BadgeCheck,
  CalendarClock,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import type { ShellNavGroup } from './nav-config';

export function buildProNav(slug: string): ShellNavGroup[] {
  const base = `/t/${slug}`;
  return [
    { items: [{ label: 'Overview', href: `${base}/dashboard`, icon: LayoutDashboard }] },
    {
      label: 'Workspace',
      items: [
        { label: 'Clients', href: `${base}/clients`, icon: Users },
        { label: 'Renewals', href: `${base}/renewals`, icon: CalendarClock },
        { label: 'Documents', href: `${base}/documents`, icon: FileText },
        { label: 'Employees', href: `${base}/employees`, icon: BadgeCheck },
      ],
    },
    {
      label: 'Account',
      items: [{ label: 'Settings', href: `${base}/settings`, icon: Settings }],
    },
  ];
}
