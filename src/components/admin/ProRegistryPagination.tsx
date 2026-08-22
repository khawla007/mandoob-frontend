import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import {
  buildProRegistryHref,
  type ProRegistryFilters,
} from '@/app/admin/users/pro-registry-params';
import { Button } from '@/components/ui/button';

export async function ProRegistryPagination({
  filters,
  totalPages,
}: {
  filters: ProRegistryFilters;
  totalPages: number;
}) {
  const t = await getTranslations('admin.user.proRegistry');
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3" aria-label={t('paginationLabel')}>
      <p className="text-muted-foreground text-sm">
        {t('pageOf', { page: filters.page, totalPages })}
      </p>
      <div className="flex gap-2">
        <Button asChild={filters.page > 1} variant="outline" size="sm" disabled={filters.page <= 1}>
          {filters.page > 1 ? (
            <Link href={buildProRegistryHref(filters, { page: filters.page - 1 })}>
              {t('previous')}
            </Link>
          ) : (
            <span>{t('previous')}</span>
          )}
        </Button>
        <Button
          asChild={filters.page < totalPages}
          variant="outline"
          size="sm"
          disabled={filters.page >= totalPages}
        >
          {filters.page < totalPages ? (
            <Link href={buildProRegistryHref(filters, { page: filters.page + 1 })}>
              {t('next')}
            </Link>
          ) : (
            <span>{t('next')}</span>
          )}
        </Button>
      </div>
    </nav>
  );
}
