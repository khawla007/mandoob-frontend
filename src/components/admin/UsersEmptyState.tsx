import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export async function UsersEmptyState({ filtersActive }: { filtersActive: boolean }) {
  const t = await getTranslations('admin');
  return (
    <div className="border-border/60 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12">
      <Users className="text-muted-foreground size-8" />
      <p className="text-sm font-medium">{t('user.emptyState.noMatch')}</p>
      {filtersActive ? (
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/users">{t('user.emptyState.resetFilters')}</Link>
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">{t('user.emptyState.noneYet')}</p>
      )}
    </div>
  );
}
