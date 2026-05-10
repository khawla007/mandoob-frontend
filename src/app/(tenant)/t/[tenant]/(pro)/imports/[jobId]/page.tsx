import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ban, CheckCircle2, Play, RotateCw } from 'lucide-react';
import { BulkImportAutoRefresh } from '@/components/pro/BulkImportAutoRefresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  cancelBulkImportAction,
  executeBulkImportAction,
  validateBulkImportAction,
} from '../actions';

export const dynamic = 'force-dynamic';

type ImportError = {
  row_number: number;
  field: string;
  message: string;
  code?: string;
};

type JobRow = {
  id: string;
  kind: 'clients' | 'employees';
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
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from('bulk_import_jobs')
    .select('id, kind, status, total_rows, processed_rows, error_rows, errors, created_at, completed_at')
    .eq('tenant_id', tenant.id)
    .eq('id', jobId)
    .maybeSingle();
  if (!data) notFound();
  const job = data as JobRow;
  const errors = Array.isArray(job.errors) ? job.errors : [];
  const busy = job.status === 'validating' || job.status === 'importing';
  const totalImportable = Math.max((job.total_rows ?? 0) - validationErrorCount(errors), 0);

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

  return (
    <div className="space-y-6">
      <BulkImportAutoRefresh enabled={busy} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import job</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {job.kind === 'clients' ? 'Client' : 'Employee'} CSV created{' '}
            {new Date(job.created_at).toLocaleString()}.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={job.kind === 'clients' ? `/t/${slug}/clients` : `/t/${slug}/employees`}>
            Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            Status <Badge variant={job.status === 'failed' ? 'destructive' : 'secondary'}>{job.status}</Badge>
          </CardTitle>
          <CardDescription>
            {job.processed_rows ?? 0} processed
            {job.total_rows ? ` of ${totalImportable} importable rows` : ''}. {job.error_rows ?? 0}{' '}
            rows need attention.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {job.status === 'uploaded' ? (
              <form action={validate}>
                <Button type="submit">
                  <CheckCircle2 className="mr-2 size-4" />
                  Validate CSV
                </Button>
              </form>
            ) : null}
            {job.status === 'validated' ? (
              <form action={execute} className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input name="skip_existing" type="checkbox" defaultChecked className="size-4" />
                  <span>Skip existing records</span>
                </label>
                <Button type="submit">
                  <Play className="mr-2 size-4" />
                  Confirm import
                </Button>
              </form>
            ) : null}
            {['uploaded', 'validated', 'validating', 'importing'].includes(job.status) ? (
              <form action={cancel}>
                <Button type="submit" variant="outline">
                  <Ban className="mr-2 size-4" />
                  Cancel
                </Button>
              </form>
            ) : null}
            {busy ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <RotateCw className="size-4 animate-spin" />
                Refreshing every 3 seconds
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Row errors</CardTitle>
          <CardDescription>Validation failures, skipped duplicates, and partial insert errors.</CardDescription>
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">No row errors reported.</p>
          ) : (
            <div className="border-border/60 overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Row</TableHead>
                    <TableHead className="w-48">Field</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-40">Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((error, index) => (
                    <TableRow key={`${error.row_number}-${error.field}-${index}`}>
                      <TableCell>{error.row_number || '-'}</TableCell>
                      <TableCell>{error.field}</TableCell>
                      <TableCell>{error.message}</TableCell>
                      <TableCell>{error.code ?? 'VALIDATION_FAILED'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {errors.length > 0 ? (
            <div className="mt-4 space-y-2">
              <Label htmlFor="errors_csv">Errors CSV</Label>
              <textarea
                id="errors_csv"
                readOnly
                className="border-input bg-background min-h-28 w-full rounded-md border p-3 font-mono text-xs"
                value={toErrorsCsv(errors)}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function validationErrorCount(errors: ImportError[]) {
  return errors.filter((error) => !error.code || error.code === 'VALIDATION_FAILED').length;
}

function toErrorsCsv(errors: ImportError[]) {
  return [
    'row_number,field,message,code',
    ...errors.map((error) =>
      [error.row_number, error.field, error.message, error.code ?? 'VALIDATION_FAILED']
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');
}
