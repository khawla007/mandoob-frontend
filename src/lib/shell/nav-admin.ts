import {
  Building2,
  Columns3,
  DollarSign,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { ShellNavGroup } from './nav-config';

export const adminNav: ShellNavGroup[] = [
  { items: [{ label: 'Overview', href: '/admin', icon: LayoutDashboard }] },
  {
    label: 'Auth',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'Sessions', href: '/admin/sessions', icon: KeyRound },
      { label: 'MFA & Security', href: '/admin/security', icon: ShieldCheck },
      { label: 'Audit logs', href: '/admin/audit-logs', icon: ScrollText },
      { label: 'Erasure requests', href: '/admin/erasure-requests', icon: ShieldAlert },
      { label: 'Finance', href: '/admin/finance', icon: DollarSign },
      { label: 'Leads', href: '/admin/leads', icon: Columns3 },
      { label: 'Cost data', href: '/admin/cost-data', icon: FileSpreadsheet },
    ],
  },
  {
    label: 'Tenants',
    items: [{ label: 'PRO firms', href: '/admin/pro-firms', icon: Building2 }],
  },
  {
    label: 'Account',
    items: [{ label: 'Settings', href: '/admin/settings', icon: Settings }],
  },
];
