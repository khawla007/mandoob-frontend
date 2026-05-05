import type { LucideIcon } from 'lucide-react';

export type ShellNavItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  badge?: string | number;
};

export type ShellNavGroup = {
  label?: string;
  items: ShellNavItem[];
};
