import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { RotateCw } from 'lucide-react';
import { BulkImportAutoRefresh } from '@/components/pro/BulkImportAutoRefresh';
import { BulkImportJobActions } from '@/components/pro/BulkImportJobActions';
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
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  safeImportErrorCode,
  safeImportFailureCode,
  safeImportField,
  safeImportJobStatus,
} from '@/lib/data/import-job-display';
import { isImportJobCancellable } from '@/lib/data/import-job-scope';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { countDistinctImportErrorRows } from '@/lib/validation/bulk-import';
import {
  cancelBulkImportAction,
  executeBulkImportAction,
  type ActionResult,
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
  version: number;
  next_row: number;
  inserted_rows: number;
  skipped_rows: number;
  failure_code: string | null;
  cancel_requested_at: string | null;
  artifact_deleted_at: string | null;
};

export default async function BulkImportJobPage({
  params,
}: {
  params: Promise<{ tenant: string; jobId: string }>;
}) {
  const { tenant: slug, jobId } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
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
      'id, kind, status, total_rows, processed_rows, error_rows, errors, created_at, completed_at, version, next_row, inserted_rows, skipped_rows, failure_code, cancel_requested_at, artifact_deleted_at',
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

  // One operation id per rendered command: a double submit replays, a stale
  // page fails with STALE_VERSION instead of acting on newer state.
  const command = { operation_id: randomUUID(), expected_version: Number(job.version) };

  async function validate(_previous: ActionResult<unknown> | null, _formData: FormData) {
    'use server';
    void _previous;
    void _formData;
    return validateBulkImportAction(slug, jobId, command);
  }

  async function execute(_previous: ActionResult<unknown> | null, _formData: FormData) {
    'use server';
    void _previous;
    void _formData;
    return executeBulkImportAction(slug, jobId, command);
  }

  async function cancel(_previous: ActionResult<unknown> | null, _formData: FormData) {
    'use server';
    void _previous;
    void _formData;
    return cancelBulkImportAction(slug, jobId, command);
  }

  const processed = numberFormatter.format(job.next_row ?? job.processed_rows ?? 0);
  const errorCount = numberFormatter.format(job.error_rows ?? 0);
  const stateMessage =
    job.status === 'completed'
      ? job.error_rows
        ? t('state.partial')
        : t('state.success')
      : job.status === 'failed'
        ? t('state.failure')
        : job.status === 'cancelled'
          ? t('state.cancel')
          : job.status === 'validating' || job.status === 'importing'
            ? t('state.parsing')
            : t('state.pending');

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
          <CardDescription>{stateMessage}</CardDescription>
          <CardDescription>
            {t('outcomes', {
              inserted: numberFormatter.format(job.inserted_rows ?? 0),
              skipped: numberFormatter.format(job.skipped_rows ?? 0),
            })}
          </CardDescription>
          {job.cancel_requested_at && job.status === 'importing' ? (
            <CardDescription>{t('cancelRequested')}</CardDescription>
          ) : null}
          {job.failure_code ? (
            <CardDescription className="text-destructive">
              {t(`failureCodes.${safeImportFailureCode(job.failure_code)}`)}
            </CardDescription>
          ) : null}
          {job.artifact_deleted_at ? (
            <CardDescription>{t('artifactRetired')}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <BulkImportJobActions
              status={safeImportJobStatus(job.status)}
              canCancel={isImportJobCancellable(job.status, job.cancel_requested_at !== null)}
              validateAction={validate}
              executeAction={execute}
              cancelAction={cancel}
              labels={{
                validate: t('validate'),
                confirm: t('confirm'),
                cancel: t('cancel'),
                cancelTitle: t('cancelTitle'),
                cancelPrompt: t('cancelPrompt', {
                  date: dateFormatter.format(new Date(job.created_at)),
                }),
                keep: t('keep'),
                confirmCancel: t('confirmCancel'),
                cannotCancel: t('cannotCancel'),
                pending: t('pending'),
                success: t('actionSuccess'),
                error: t('actionError'),
              }}
            />
            {busy ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <RotateCw className="size-4 animate-spin" aria-hidden />
                {t('refreshing')}
              </div>
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
          <p className="text-muted-foreground mt-4 text-sm">{t('errorsDownloadUnavailable')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function validationErrorCount(errors: ImportError[]) {
  return countDistinctImportErrorRows(
    errors.filter((error) => error.code !== 'DUPLICATE_EXISTING'),
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
