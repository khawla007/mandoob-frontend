import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientsTable } from '@/components/pro/ClientsTable';
import { CreateClientForm } from '@/components/pro/CreateClientForm';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { listClientsForPro } from '@/lib/data/clients-list';
import { CLIENT_STATUSES, type ClientStatus } from '@/lib/validation/client';

export const dynamic = 'force-dynamic';

type SearchParams = { status?: string; q?: string };

function parseStatus(raw: string | undefined): ClientStatus | 'all' {
  if (!raw) return 'all';
  return (CLIENT_STATUSES as readonly string[]).includes(raw) ? (raw as ClientStatus) : 'all';
}

type StatusOption = { value: ClientStatus | 'all'; labelKey: string };

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'all', labelKey: 'all' },
  { value: 'onboarding', labelKey: 'onboarding' },
  { value: 'active', labelKey: 'active' },
  { value: 'renewal_due', labelKey: 'renewalDue' },
  { value: 'renewal_overdue', labelKey: 'overdue' },
  { value: 'suspended', labelKey: 'suspended' },
  { value: 'churned', labelKey: 'churned' },
];

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const status = parseStatus(sp.status);

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const t = await getTranslations('pro');

  const rows = await listClientsForPro({ tenantId: tenant.id, status, q: sp.q ?? null });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('clients')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('clientsSubtitle', { tenant: tenant.name, count: rows.length })}
          </p>
        </div>
        <CreateClientForm slug={slug} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('directory')}</CardTitle>
          <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
            {STATUS_OPTIONS.map((o) => (
              <StatusLink
                key={o.value}
                slug={slug}
                current={status}
                value={o.value}
                label={t(o.labelKey)}
              />
            ))}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">{t('noClientsYet')}</p>
          ) : (
            <div className="border-border/60 overflow-hidden rounded-lg border">
              <ClientsTable slug={slug} rows={rows} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusLink({
  slug,
  current,
  value,
  label,
}: {
  slug: string;
  current: ClientStatus | 'all';
  value: ClientStatus | 'all';
  label: string;
}) {
  const href = value === 'all' ? `/t/${slug}/clients` : `/t/${slug}/clients?status=${value}`;
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
