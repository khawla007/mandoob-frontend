import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NewRenewalDialog } from '@/components/pro/NewRenewalDialog';
import { RenewalsTable, type CompanyLite } from '@/components/pro/RenewalsTable';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { listRenewalsForCompany, type RenewalRow, type RenewalStatus } from '@/lib/data/renewals';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { parseRenewalSearch, type RenewalSearchParams, type RenewalTab } from './page-logic';

export const dynamic = 'force-dynamic';

const TABS: { value: RenewalTab; labelKey: string }[] = [
  { value: 'active', labelKey: 'active' },
  { value: 'completed', labelKey: 'completed' },
  { value: 'cancelled', labelKey: 'cancelled' },
];

const ACTIVE_STATUSES: RenewalStatus[] = ['upcoming', 'due_soon', 'overdue'];

export default async function RenewalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<RenewalSearchParams>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const { tab, renewalId, type, days, deadlineDate, deadlinePeriod } = parseRenewalSearch(sp);

  const { session, tenant } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const t = await getTranslations('pro');

  const statusFilter: RenewalStatus[] =
    tab === 'active' ? ACTIVE_STATUSES : tab === 'completed' ? ['completed'] : ['cancelled'];

  const rows = await listRenewalsForCompany(
    tenant.id,
    company.id,
    renewalId
      ? { id: renewalId }
      : {
          status: statusFilter,
          type,
          bucket: days ?? undefined,
          deadlineDate,
          deadlinePeriod,
        },
  );

  const companiesMap = new Map<string, CompanyLite>([
    [company.id, { id: company.id, company_name: company.companyName }],
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('renewals')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('renewalsPageSubtitle', { tenant: tenant.name })}
          </p>
        </div>
        <NewRenewalDialog slug={slug} />
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
            companies={companiesMap}
            showCompanyColumn
            slug={slug}
            mode={tab === 'active' ? 'bucketed' : 'flat'}
            emptyMessage={
              tab === 'active'
                ? t('renewalsEmptyActive')
                : tab === 'completed'
                  ? t('renewalsEmptyCompleted')
                  : t('renewalsEmptyCancelled')
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
  current: RenewalTab;
  value: RenewalTab;
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
