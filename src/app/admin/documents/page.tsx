import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { listAdminDocumentCenter } from '@/lib/data/admin-document-center';
import {
  ADMIN_DOCUMENT_STATES,
  ADMIN_DOCUMENT_TYPES,
  adminDocumentCenterHref,
  parseAdminDocumentCenterQuery,
  type RawAdminDocumentCenterQuery,
} from './query';

export const dynamic = 'force-dynamic';

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<RawAdminDocumentCenterQuery>;
}) {
  await requirePlatformOperator();
  const [t, locale, rawQuery] = await Promise.all([
    getTranslations('admin.management.documents'),
    getLocale(),
    searchParams,
  ]);
  const query = parseAdminDocumentCenterQuery(rawQuery);
  const result = await listAdminDocumentCenter(query);
  if (result.kind !== 'error' && result.page !== query.page) {
    redirect(adminDocumentCenterHref(query, result.page));
  }
  const dateTime = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    dateStyle: 'medium',
  });

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
      />
      <Card className="overflow-hidden">
        <CardHeader className="border-border/60 border-b">
          <CardTitle>{t('queueTitle')}</CardTitle>
          <CardDescription>{t('queueDescription')}</CardDescription>
          <form
            method="get"
            className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_12rem_14rem_auto_auto] xl:items-end"
          >
            <div className="grid min-w-0 gap-1.5 sm:col-span-2 xl:col-span-1">
              <Label htmlFor="document-search">{t('filters.search')}</Label>
              <Input
                id="document-search"
                name="q"
                defaultValue={query.q ?? ''}
                maxLength={100}
                placeholder={t('filters.searchPlaceholder')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="document-state">{t('filters.state')}</Label>
              <select
                id="document-state"
                name="state"
                defaultValue={query.state}
                className="border-input bg-background min-h-11 rounded-md border px-3 text-sm sm:min-h-9"
              >
                {ADMIN_DOCUMENT_STATES.map((state) => (
                  <option key={state} value={state}>
                    {t(`states.${state}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="document-type">{t('filters.type')}</Label>
              <select
                id="document-type"
                name="docType"
                defaultValue={query.docType}
                className="border-input bg-background min-h-11 rounded-md border px-3 text-sm sm:min-h-9"
              >
                <option value="all">{t('types.all')}</option>
                {ADMIN_DOCUMENT_TYPES.map((docType) => (
                  <option key={docType} value={docType}>
                    {t(`types.${docType}`)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="min-h-11 sm:min-h-9">
              {t('filters.apply')}
            </Button>
            <Button asChild variant="outline" className="min-h-11 sm:min-h-9">
              <Link href="/admin/documents">{t('filters.reset')}</Link>
            </Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {result.kind === 'error' ? (
            <div role="alert" className="px-6 py-14 text-center">
              <p className="font-medium">{t('error.title')}</p>
              <p className="text-muted-foreground mt-1 text-sm">{t('error.description')}</p>
            </div>
          ) : result.kind === 'empty' ? (
            <div className="px-6 py-14 text-center">
              <p className="font-medium">{t('empty.title')}</p>
              <p className="text-muted-foreground mt-1 text-sm">{t('empty.description')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto" role="region" aria-label={t('table.label')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('table.company')}</TableHead>
                    <TableHead>{t('table.document')}</TableHead>
                    <TableHead>{t('table.workflow')}</TableHead>
                    <TableHead>{t('table.due')}</TableHead>
                    <TableHead>{t('table.uploaded')}</TableHead>
                    <TableHead>{t('table.expiry')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row, index) => (
                    <TableRow key={`${result.page}-${index}`}>
                      <TableCell className="min-w-52">
                        <span className="font-medium">{row.companyName}</span>
                        <p className="text-muted-foreground mt-0.5 text-xs">{row.workspaceName}</p>
                      </TableCell>
                      <TableCell className="min-w-52">
                        <span>{row.label}</span>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {t(`types.${row.docType}`)} · {t(`kind.${row.kind}`)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={row.reviewStatus === 'rejected' ? 'destructive' : 'outline'}
                        >
                          {row.reviewStatus
                            ? t(`reviewStatus.${row.reviewStatus}`)
                            : row.requestStatus
                              ? t(`requestStatus.${row.requestStatus}`)
                              : t('notAvailable')}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.dueAt ? dateTime.format(new Date(row.dueAt)) : t('notAvailable')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.uploadedAt
                          ? dateTime.format(new Date(row.uploadedAt))
                          : t('notAvailable')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.expiresOn
                          ? date.format(new Date(`${row.expiresOn}T00:00:00Z`))
                          : t('notAvailable')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {result.kind !== 'error' && result.total > 0 ? (
          <div className="border-border/60 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              {t('pagination.summary', {
                page: result.page,
                totalPages: result.totalPages,
                total: result.total,
              })}
            </p>
            <nav className="flex gap-2" aria-label={t('pagination.label')}>
              {result.page > 1 ? (
                <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  <Link href={adminDocumentCenterHref(query, result.page - 1)}>
                    {t('pagination.previous')}
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled className="min-h-11 sm:min-h-9">
                  {t('pagination.previous')}
                </Button>
              )}
              {result.page < result.totalPages ? (
                <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  <Link href={adminDocumentCenterHref(query, result.page + 1)}>
                    {t('pagination.next')}
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled className="min-h-11 sm:min-h-9">
                  {t('pagination.next')}
                </Button>
              )}
            </nav>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
