import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PagesTable } from '@/components/pages/PagesTable';
import { clampAdminPage, pageHref } from '@/components/pages/admin-page-state';
import { requireRole } from '@/lib/auth/require-role';
import { listAdminCmsPages } from '@/lib/data/pages';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';
type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminPagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin.cms');
  const rawPage = (await searchParams).page;
  const rawValue = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  const parsed = Number.parseInt(rawValue ?? '1', 10);
  const requestedPage = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  let result = await listAdminCmsPages({ page: requestedPage, pageSize: 8 });
  const currentPage = clampAdminPage(rawPage, result.total, result.pageSize);
  if (currentPage !== result.page)
    result = await listAdminCmsPages({ page: currentPage, pageSize: 8 });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const start = (currentPage - 1) * result.pageSize;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
            {t('pages.eyebrow')}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('pages.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('pages.description')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/pages/new">{t('pages.new')}</Link>
        </Button>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t('pages.library')}</CardTitle>
          <CardDescription>{t('pages.total', { count: result.total, perPage: 8 })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {result.total === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <p className="font-medium">{t('pages.empty')}</p>
              <p className="text-muted-foreground mt-1 text-sm">{t('pages.emptyDescription')}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <PagesTable pages={result.items} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-sm">
                  {t('showing', {
                    from: start + 1,
                    to: Math.min(start + result.pageSize, result.total),
                    total: result.total,
                  })}
                </p>
                <nav aria-label={t('pages.pagination')} className="flex gap-2">
                  <Button
                    asChild={currentPage > 1}
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                  >
                    {currentPage > 1 ? (
                      <Link href={pageHref(currentPage - 1)}>
                        <ChevronLeft />
                        {t('previous')}
                      </Link>
                    ) : (
                      <span>
                        <ChevronLeft />
                        {t('previous')}
                      </span>
                    )}
                  </Button>
                  <span className="grid min-w-20 place-items-center text-sm tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    asChild={currentPage < totalPages}
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                  >
                    {currentPage < totalPages ? (
                      <Link href={pageHref(currentPage + 1)}>
                        {t('next')}
                        <ChevronRight />
                      </Link>
                    ) : (
                      <span>
                        {t('next')}
                        <ChevronRight />
                      </span>
                    )}
                  </Button>
                </nav>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
