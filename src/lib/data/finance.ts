import 'server-only';
import { formatMoney } from '@/lib/format/money';

export type FinanceSubscriptionInput = {
  unit_amount_minor: number;
  interval: string;
};

export type FinanceKpiNumbers = {
  mrrMinor: number;
  arrMinor: number;
  activeTenantCount: number;
  churnRate: number;
};

export type FinanceKpi = {
  /** Stable i18n key under admin.finance.kpi.* (resolved at the render boundary). */
  labelKey: string;
  value: string;
  /** Stable i18n key under admin.finance.kpi.* (resolved at the render boundary). */
  helperKey: string;
};

export type TenantMrrRow = {
  tenantId: string;
  tenantName: string;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  mrr: string;
  mrrMinor: number;
};

export function monthlyAmountMinor(amountMinor: number, interval: string): number {
  if (interval === 'year') return Math.round(amountMinor / 12);
  return amountMinor;
}

export function calculateFinanceKpis(args: {
  activeSubscriptions: FinanceSubscriptionInput[];
  canceledLast30: number;
  activeAtStart: number;
}): FinanceKpiNumbers {
  const mrrMinor = args.activeSubscriptions.reduce(
    (sum, row) => sum + monthlyAmountMinor(row.unit_amount_minor, row.interval),
    0,
  );
  return {
    mrrMinor,
    arrMinor: mrrMinor * 12,
    activeTenantCount: args.activeSubscriptions.length,
    churnRate: args.activeAtStart > 0 ? (args.canceledLast30 / args.activeAtStart) * 100 : 0,
  };
}

export async function getFinanceKpis(): Promise<FinanceKpi[]> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 864e5).toISOString();

  const [active, canceled, activeAtStart] = await Promise.all([
    admin.from('subscriptions').select('unit_amount_minor, interval').eq('status', 'active'),
    admin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'canceled')
      .gte('canceled_at', d30),
    admin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', d30)
      .or(`canceled_at.is.null,canceled_at.gte.${d30}`),
  ]);

  const numbers = calculateFinanceKpis({
    activeSubscriptions: (active.data ?? []) as FinanceSubscriptionInput[],
    canceledLast30: canceled.count ?? 0,
    activeAtStart: activeAtStart.count ?? 0,
  });

  return [
    {
      labelKey: 'mrr',
      value: formatMoney(numbers.mrrMinor, 'USD'),
      helperKey: 'helperMonthlyValue',
    },
    { labelKey: 'arr', value: formatMoney(numbers.arrMinor, 'USD'), helperKey: 'helperMrrTimes12' },
    {
      labelKey: 'activeTenants',
      value: numbers.activeTenantCount.toLocaleString('en-US'),
      helperKey: 'helperActiveSubscriptions',
    },
    {
      labelKey: 'churn',
      value: `${numbers.churnRate.toFixed(1)}%`,
      helperKey: 'helperLast30Days',
    },
  ];
}

export async function getTenantMrrRows(): Promise<TenantMrrRow[]> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from('subscriptions')
    .select(
      'tenant_id, plan, status, current_period_end, unit_amount_minor, interval, tenants(name)',
    )
    .order('unit_amount_minor', { ascending: false })
    .limit(200);

  return (
    (data ?? []) as unknown as Array<{
      tenant_id: string;
      plan: string;
      status: string;
      current_period_end: string | null;
      unit_amount_minor: number;
      interval: string;
      tenants: { name: string } | null;
    }>
  )
    .map((row) => {
      const mrrMinor = monthlyAmountMinor(row.unit_amount_minor, row.interval);
      return {
        tenantId: row.tenant_id,
        tenantName: row.tenants?.name ?? row.tenant_id,
        plan: row.plan,
        status: row.status,
        currentPeriodEnd: row.current_period_end,
        mrr: formatMoney(mrrMinor, 'USD'),
        mrrMinor,
      };
    })
    .sort((a, b) => b.mrrMinor - a.mrrMinor);
}
