'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/auth/roles';
import { visibleTabs } from './tab-defs';

export { visibleTabs } from './tab-defs';

export function AccountTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const tAccount = useTranslations('account');
  const tabs = visibleTabs(role);
  return (
    <nav role="tablist" aria-label="Account sections" className="border-b">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          const label = tAccount(tab.labelKey);
          return (
            <li key={tab.href}>
              <Link
                role="tab"
                aria-selected={active}
                href={tab.href}
                className={cn(
                  'inline-block border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
