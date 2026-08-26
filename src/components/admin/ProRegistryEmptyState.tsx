import Link from 'next/link';
import { FilterX, UserRoundPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';

export async function ProRegistryEmptyState({ filtersActive }: { filtersActive: boolean }) {
  const t = await getTranslations('admin.user.proRegistry');
  const Icon = filtersActive ? FilterX : UserRoundPlus;
  return (
    <div
      role="status"
      className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--lifecycle-border)] bg-[var(--lifecycle-surface)] p-6 text-center"
    >
      <Icon aria-hidden className="text-muted-foreground size-8" />
      <p className="font-medium">{t(filtersActive ? 'noResults' : 'empty')}</p>
      <p className="text-muted-foreground max-w-md text-sm">
        {t(filtersActive ? 'noResultsDescription' : 'emptyDescription')}
      </p>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={filtersActive ? '/admin/users?role=pro' : '/admin/users/new?role=pro'}>
          {t(filtersActive ? 'reset' : 'create')}
        </Link>
      </Button>
    </div>
  );
}
