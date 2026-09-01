'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  buildDashboardCommandEntries,
  resolveDashboardNav,
  type DashboardNavKind,
} from '@/lib/shell/dashboard-navigation-model';

export function DashboardCommand({
  navKind,
  navSlug,
}: {
  navKind: DashboardNavKind;
  navSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useTranslations('shell');
  const groups = useMemo(() => {
    const translate = (key: string | undefined, fallback: string | undefined) =>
      key ? t(key) : (fallback ?? '');
    const entries = buildDashboardCommandEntries(resolveDashboardNav(navKind, navSlug), translate);
    const grouped = new Map<string, typeof entries>();
    for (const entry of entries) {
      const group = entry.group || t('navigation');
      grouped.set(group, [...(grouped.get(group) ?? []), entry]);
    }
    return grouped;
  }, [navKind, navSlug, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="dashboard-command-trigger min-w-9 gap-2"
        onClick={() => setOpen(true)}
        aria-label={t('findPage')}
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden lg:inline">{t('findPage')}</span>
        <kbd className="text-muted-foreground hidden font-mono text-[0.65rem] xl:inline">⌘K</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t('findPage')}
        description={t('findPageDescription')}
        showCloseButton
      >
        <CommandInput placeholder={t('findPagePlaceholder')} aria-label={t('findPage')} />
        <CommandList>
          <CommandEmpty>{t('noPagesFound')}</CommandEmpty>
          {[...groups.entries()].map(([group, entries]) => (
            <CommandGroup key={group} heading={group}>
              {entries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <CommandItem
                    key={`${entry.group}:${entry.href}:${entry.label}`}
                    value={`${entry.group} ${entry.label}`}
                    onSelect={() => navigate(entry.href)}
                  >
                    {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
                    <span>{entry.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
