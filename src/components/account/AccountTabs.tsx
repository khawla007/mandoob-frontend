'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/auth/roles';
import { visibleTabs } from './tab-defs';

export { visibleTabs } from './tab-defs';

export function AccountTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const tabs = visibleTabs(role);
  return (
    <nav role="tablist" aria-label="Account sections" className="border-b">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map((t) => {
          const active = pathname === t.href;
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
