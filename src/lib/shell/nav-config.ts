import type { LucideIcon } from 'lucide-react';

export type ShellNavItem = {
  /**
   * Translation key under `messages.shell`. The sidebar renders it via
   * `useTranslations('shell')`. `labelFallback` is the English fallback used
   * when a translation is missing — never shown if `labelKey` is valid.
   */
  labelKey: string;
  labelFallback: string;
  href: string;
  icon?: LucideIcon;
  badge?: string | number;
};

export type ShellNavGroup = {
  /** Translation key under `messages.shell` for the group label. */
  labelKey?: string;
  labelFallback?: string;
  items: ShellNavItem[];
};
