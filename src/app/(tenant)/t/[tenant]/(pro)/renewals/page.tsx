import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NewRenewalDialog } from '@/components/pro/NewRenewalDialog';
import { RenewalsTable, type ClientLite } from '@/components/pro/RenewalsTable';
import { listClientsForTenant } from '@/lib/data/clients';
import { listRenewalsForTenant, type RenewalRow, type RenewalStatus } from '@/lib/data/renewals';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';

type Tab = 'active' | 'completed' | 'cancelled';
const TABS: { value: Tab; labelKey: string }[] = [
  { value: 'active', labelKey: 'active' },
  { value: 'completed', labelKey: 'completed' },
  { value: 'cancelled', labelKey: 'cancelled' },
];

const ACTIVE_STATUSES: RenewalStatus[] = ['upcoming', 'due_soon', 'overdue'];

function parseTab(raw: string | undefined): Tab {
  if (raw === 'completed' || raw === 'cancelled') return raw;
  return 'active';
}

async function fetchClientsByIds(
  tenantId: string,
  ids: string[],
): Promise<Map<string, ClientLite>> {
  const map = new Map<string, ClientLite>();
  if (ids.length === 0) return map;
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('clients')
    .select('id, company_name')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  if (error) {
    console.error('fetchClientsByIds failed', error);
    return map;
  }
  for (const c of (data ?? []) as ClientLite[]) map.set(c.id, c);
  return map;
}

export default async function RenewalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const t = await getTranslations('pro');

  const statusFilter: RenewalStatus[] =
    tab === 'active' ? ACTIVE_STATUSES : tab === 'completed' ? ['completed'] : ['cancelled'];

  const [rows, clientOptions] = await Promise.all([
    listRenewalsForTenant(tenant.id, { status: statusFilter }),
    listClientsForTenant({ tenantId: tenant.id, limit: 50 }),
  ]);

  const clientIds = Array.from(new Set(rows.map((r) => r.clientId)));
  const clientsMap = await fetchClientsByIds(tenant.id, clientIds);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('renewals')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            License, visa, Emirates ID, and Ejari renewals across {tenant.name}.
          </p>
        </div>
        <NewRenewalDialog
          slug={slug}
          clients={clientOptions.map((c) => ({ id: c.id, company_name: c.company_name }))}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('pipeline')}</CardTitle>
          <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
            {TABS.map((tab2) => (
              <TabLink
                key={tab2.value}
                slug={slug}
                current={tab}
                value={tab2.value}
                label={t(tab2.labelKey)}
              />
            ))}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RenewalsTable
            rows={rows as RenewalRow[]}
            clients={clientsMap}
            showClientColumn
            slug={slug}
            mode={tab === 'active' ? 'bucketed' : 'flat'}
            emptyMessage={
              tab === 'active'
                ? 'No active renewals. Create one or wait for a license_expiry to seed an auto-row.'
                : tab === 'completed'
                  ? 'No completed renewals yet.'
                  : 'No cancelled renewals.'
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function TabLink({
  slug,
  current,
  value,
  label,
}: {
  slug: string;
  current: Tab;
  value: Tab;
  label: string;
}) {
  const href = value === 'active' ? `/t/${slug}/renewals` : `/t/${slug}/renewals?tab=${value}`;
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
