'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export type SettingsTab = { href: string; label: string };

export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();
  return (
    <nav role="tablist" aria-label="Settings sections" className="border-b">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map((t) => {
          // Pick the longest matching tab href so a child route doesn't
          // also activate its parent (e.g. /admin/settings/security must
          // not light up the /admin/settings Profile tab).
          const matched = tabs
            .filter((c) => pathname === c.href || pathname.startsWith(c.href + '/'))
            .sort((a, b) => b.href.length - a.href.length)[0];
          const active = matched?.href === t.href;
          return (
            <li key={t.href}>
              <Link
                role="tab"
                aria-selected={active}
                href={t.href}
                className={cn(
                  'inline-block border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
