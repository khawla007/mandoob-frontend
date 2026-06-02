import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ProFirmsTable } from '@/components/admin/ProFirmsTable';
import { requireRole } from '@/lib/auth/require-role';
import { listProFirms } from '@/lib/data/pro-firms';
import { TENANT_STATUSES, type TenantStatus } from '@/lib/validation/tenant-onboarding';

export const dynamic = 'force-dynamic';

type SearchParams = { status?: string; q?: string; created?: string };

function parseStatus(raw: string | undefined): TenantStatus | 'all' {
  if (!raw) return 'all';
  return (TENANT_STATUSES as readonly string[]).includes(raw) ? (raw as TenantStatus) : 'all';
}

export default async function ProFirmsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole('super_admin');
  const t = await getTranslations('admin');
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const rows = await listProFirms({ status, q: sp.q ?? null });

  return (
    <div className="space-y-6">
      {sp.created && (
        <Alert>
          <AlertTitle>{t('proFirms.page.createdTitle')}</AlertTitle>
          <AlertDescription>{t('proFirms.page.createdDescription')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('proFirms.page.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('proFirms.page.intro', { count: rows.length })}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/pro-firms/new">{t('proFirms.page.createButton')}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('proFirms.page.directory')}</CardTitle>
          <CardDescription>
            {t('proFirms.page.statusFilterLabel')}{' '}
            <StatusLink current={status} value="all" label={t('proFirms.page.filterAll')} />{' '}
            <StatusLink current={status} value="active" label={t('enums.tenantStatus.active')} />{' '}
            <StatusLink current={status} value="pending" label={t('enums.tenantStatus.pending')} />{' '}
            <StatusLink
              current={status}
              value="suspended"
              label={t('enums.tenantStatus.suspended')}
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t('proFirms.page.empty')}
            </p>
          ) : (
            <div className="border-border/60 overflow-hidden rounded-lg border">
              <ProFirmsTable rows={rows} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusLink({
  current,
  value,
  label,
}: {
  current: TenantStatus | 'all';
  value: TenantStatus | 'all';
  label: string;
}) {
  const href = value === 'all' ? '/admin/pro-firms' : `/admin/pro-firms?status=${value}`;
  const active = current === value;
  return (
    <Link
      href={href}
      className={
        active
          ? 'text-foreground font-medium underline-offset-4 hover:underline'
          : 'text-muted-foreground hover:text-foreground underline-offset-4 hover:underline'
      }
    >
      {label}
    </Link>
  );
}
