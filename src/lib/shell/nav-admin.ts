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
  {
    items: [
      { labelKey: 'overview', labelFallback: 'Overview', href: '/admin', icon: LayoutDashboard },
    ],
  },
  {
    labelKey: 'auth',
    labelFallback: 'Auth',
    items: [
      { labelKey: 'users', labelFallback: 'Users', href: '/admin/users', icon: Users },
      { labelKey: 'sessions', labelFallback: 'Sessions', href: '/admin/sessions', icon: KeyRound },
      {
        labelKey: 'mfaAndSecurity',
        labelFallback: 'MFA & Security',
        href: '/admin/security',
        icon: ShieldCheck,
      },
      {
        labelKey: 'auditLogs',
        labelFallback: 'Audit logs',
        href: '/admin/audit-logs',
        icon: ScrollText,
      },
      {
        labelKey: 'erasureRequests',
        labelFallback: 'Erasure requests',
        href: '/admin/erasure-requests',
        icon: ShieldAlert,
      },
      {
        labelKey: 'finance',
        labelFallback: 'Finance',
        href: '/admin/finance',
        icon: DollarSign,
      },
      {
        labelKey: 'leads',
        labelFallback: 'Leads',
        href: '/admin/leads',
        icon: Columns3,
      },
      {
        labelKey: 'costData',
        labelFallback: 'Cost data',
        href: '/admin/cost-data',
        icon: FileSpreadsheet,
      },
    ],
  },
  {
    labelKey: 'tenants',
    labelFallback: 'Tenants',
    items: [
      {
        labelKey: 'proFirms',
        labelFallback: 'PRO firms',
        href: '/admin/pro-firms',
        icon: Building2,
      },
    ],
  },
  {
    labelKey: 'account',
    labelFallback: 'Account',
    items: [
      { labelKey: 'settings', labelFallback: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];
