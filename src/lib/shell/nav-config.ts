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
  children?: ShellNavItem[];
};

export type ShellNavGroup = {
  /** Translation key under `messages.shell` for the group label. */
  labelKey?: string;
  labelFallback?: string;
  items: ShellNavItem[];
};

export function resolveActiveShellHref(groups: ShellNavGroup[], pathname: string): string | null {
  const matches = groups
    .flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])]))
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    .toSorted((a, b) => b.href.length - a.href.length);

  return matches[0]?.href ?? null;
}
