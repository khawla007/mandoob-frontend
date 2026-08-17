import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Ban, CheckCircle2, Play, RotateCw } from 'lucide-react';
import { BulkImportAutoRefresh } from '@/components/pro/BulkImportAutoRefresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  safeImportErrorCode,
  safeImportField,
  safeImportJobStatus,
} from '@/lib/data/import-job-display';
import { isImportJobCancellable } from '@/lib/data/import-job-scope';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { countDistinctImportErrorRows } from '@/lib/validation/bulk-import';
import {
  cancelBulkImportAction,
  executeBulkImportAction,
  validateBulkImportAction,
} from '../actions';

export const dynamic = 'force-dynamic';

type ImportError = {
  row_number: number;
  field: string;
  message?: string;
  code?: string;
};

type JobRow = {
  id: string;
  kind: 'employees';
  status: string;
  total_rows: number | null;
  processed_rows: number | null;
  error_rows: number | null;
  errors: ImportError[] | null;
  created_at: string;
  completed_at: string | null;
};

export default async function BulkImportJobPage({
  params,
}: {
  params: Promise<{ tenant: string; jobId: string }>;
}) {
  const { tenant: slug, jobId } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const [t, locale] = await Promise.all([getTranslations('pro.importJob'), getLocale()]);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  });
  const numberFormatter = new Intl.NumberFormat(locale);
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('bulk_import_jobs')
    .select(
      'id, kind, status, total_rows, processed_rows, error_rows, errors, created_at, completed_at',
    )
    .eq('tenant_id', tenant.id)
    .eq('company_id', company.id)
    .eq('id', jobId)
    .maybeSingle();
  if (error || !data) notFound();
  const job = data as JobRow;
  const errors = Array.isArray(job.errors) ? job.errors : [];
  const busy = job.status === 'validating' || job.status === 'importing';
  const totalImportable = Math.max((job.total_rows ?? 0) - validationErrorCount(errors), 0);
  const displayErrors = errors.map((error) => ({
    row: error.row_number > 0 ? numberFormatter.format(error.row_number) : t('emptyValue'),
    field: t(`fields.${safeImportField(error.field)}`),
    message: t(`errorCodes.${safeImportErrorCode(error.code)}`),
    code: t(`errorCodeLabels.${safeImportErrorCode(error.code)}`),
  }));

  async function validate() {
    'use server';
    await validateBulkImportAction(slug, jobId);
  }

  async function execute(formData: FormData) {
    'use server';
    await executeBulkImportAction(slug, jobId, {
      skipExisting: formData.get('skip_existing') !== null,
    });
  }

  async function cancel() {
    'use server';
    await cancelBulkImportAction(slug, jobId);
  }

  const processed = numberFormatter.format(job.processed_rows ?? 0);
  const errorCount = numberFormatter.format(job.error_rows ?? 0);

  return (
    <div className="space-y-6">
      <BulkImportAutoRefresh enabled={busy} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('created', { date: dateFormatter.format(new Date(job.created_at)) })}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/t/${encodeURIComponent(slug)}/employees`}>{t('back')}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {t('statusTitle')}{' '}
            <Badge variant={job.status === 'failed' ? 'destructive' : 'secondary'}>
              {t(`statuses.${safeImportJobStatus(job.status)}`)}
            </Badge>
          </CardTitle>
          <CardDescription>
            {job.total_rows
              ? t('progress', {
                  processed,
                  total: numberFormatter.format(totalImportable),
                  errors: errorCount,
                })
              : t('progressNoTotal', { processed, errors: errorCount })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {job.status === 'uploaded' ? (
              <form action={validate}>
                <Button type="submit">
                  <CheckCircle2 className="me-2 size-4" aria-hidden />
                  {t('validate')}
                </Button>
              </form>
            ) : null}
            {job.status === 'validated' ? (
              <form action={execute} className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input name="skip_existing" type="checkbox" defaultChecked className="size-4" />
                  <span>{t('skipExisting')}</span>
                </label>
                <Button type="submit">
                  <Play className="me-2 size-4" aria-hidden />
                  {t('confirm')}
                </Button>
              </form>
            ) : null}
            {isImportJobCancellable(job.status) ? (
              <form action={cancel}>
                <Button type="submit" variant="outline">
                  <Ban className="me-2 size-4" aria-hidden />
                  {t('cancel')}
                </Button>
              </form>
            ) : null}
            {busy ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <RotateCw className="size-4 animate-spin" aria-hidden />
                {t('refreshing')}
              </div>
            ) : null}
            {job.status === 'importing' ? (
              <p className="text-muted-foreground text-sm">{t('cannotCancel')}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('errorsTitle')}</CardTitle>
          <CardDescription>{t('errorsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {displayErrors.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t('noErrors')}</p>
          ) : (
            <div className="border-border/60 overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">{t('columns.row')}</TableHead>
                    <TableHead className="w-48">{t('columns.field')}</TableHead>
                    <TableHead>{t('columns.message')}</TableHead>
                    <TableHead className="w-40">{t('columns.code')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayErrors.map((rowError, index) => (
                    <TableRow key={`${rowError.row}-${rowError.field}-${index}`}>
                      <TableCell>{rowError.row}</TableCell>
                      <TableCell>{rowError.field}</TableCell>
                      <TableCell>{rowError.message}</TableCell>
                      <TableCell>{rowError.code}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {displayErrors.length > 0 ? (
            <div className="mt-4 space-y-2">
              <Label htmlFor="errors_csv">{t('errorsCsv')}</Label>
              <textarea
                id="errors_csv"
                dir="ltr"
                readOnly
                className="border-input bg-background min-h-28 w-full rounded-md border p-3 font-mono text-xs"
                value={toErrorsCsv(displayErrors, t('csvHeader'))}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function validationErrorCount(errors: ImportError[]) {
  return countDistinctImportErrorRows(
    errors.filter((error) => !error.code || error.code === 'VALIDATION_FAILED'),
  );
}

function toErrorsCsv(
  errors: Array<{ row: string; field: string; message: string; code: string }>,
  header: string,
) {
  return [
    header,
    ...errors.map((error) =>
      [error.row, error.field, error.message, error.code]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');
}
