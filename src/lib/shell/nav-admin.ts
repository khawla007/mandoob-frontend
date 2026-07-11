import {
  Building2,
  Columns3,
  DollarSign,
  FileSpreadsheet,
  Files,
  FolderTree,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  Newspaper,
  Tags,
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
    labelKey: 'catalog',
    labelFallback: 'Catalog',
    items: [
      {
        labelKey: 'costData',
        labelFallback: 'Cost data',
        href: '/admin/cost-data',
        icon: FileSpreadsheet,
      },
      {
        labelKey: 'taxonomies',
        labelFallback: 'Taxonomies',
        href: '/admin/blog/categories',
        icon: FolderTree,
        children: [
          {
            labelKey: 'blogCategories',
            labelFallback: 'Categories',
            href: '/admin/blog/categories',
            icon: FolderTree,
          },
          {
            labelKey: 'blogAttributes',
            labelFallback: 'Attributes',
            href: '/admin/blog/attributes',
            icon: Columns3,
          },
          {
            labelKey: 'blogTags',
            labelFallback: 'Tags',
            href: '/admin/blog/tags',
            icon: Tags,
          },
        ],
      },
    ],
  },
  {
    labelKey: 'editorial',
    labelFallback: 'Editorial',
    items: [
      {
        labelKey: 'blog',
        labelFallback: 'Blog',
        href: '/admin/blog',
        icon: Newspaper,
      },
      {
        labelKey: 'pages',
        labelFallback: 'Pages',
        href: '/admin/pages',
        icon: Files,
      },
    ],
  },
  {
    labelKey: 'business',
    labelFallback: 'Business',
    items: [
      {
        labelKey: 'leads',
        labelFallback: 'Leads',
        href: '/admin/leads',
        icon: Columns3,
      },
      {
        labelKey: 'finance',
        labelFallback: 'Finance',
        href: '/admin/finance',
        icon: DollarSign,
      },
      {
        labelKey: 'whatsappTemplates',
        labelFallback: 'WhatsApp templates',
        href: '/admin/whatsapp-templates',
        icon: MessagesSquare,
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
    labelKey: 'authSecurity',
    labelFallback: 'Auth & Security',
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
