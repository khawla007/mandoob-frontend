import { FileText, IdCard, LayoutDashboard, Settings } from 'lucide-react';
import type { ShellNavGroup } from './nav-config';

export function buildEmployeeNav(slug: string): ShellNavGroup[] {
  const base = `/t/${slug}/employee`;
  return [
    { items: [{ label: 'Overview', href: `${base}/dashboard`, icon: LayoutDashboard }] },
    {
      label: 'My records',
      items: [
        { label: 'Visa & EID', href: `${base}/identity`, icon: IdCard },
        { label: 'Documents', href: `${base}/documents`, icon: FileText },
      ],
    },
    {
      label: 'Account',
      items: [{ label: 'Settings', href: `${base}/settings`, icon: Settings }],
    },
  ];
}
