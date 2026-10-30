import { z } from 'zod';
import type { BillingCadence, NumericAllowance, PlanAllowances, PlanKey } from './catalog';

export type AllowanceKey = NumericAllowance | 'advancedReports';
export type EntitlementSnapshot = {
  id: string;
  tenantId: string;
  catalogVersionId: string;
  plan: PlanKey;
  cadence: BillingCadence;
  status: 'trialing' | 'active' | 'past_due' | 'unpaid' | 'canceled' | 'paused';
  periodStart: string;
  periodEnd: string;
  graceUntil: string | null;
  allowances: PlanAllowances;
  addonDeltas: Partial<Record<NumericAllowance, number>>;
};
export type AllowanceDecision =
  | { status: 'allowed'; remaining: number }
  | { status: 'limit_reached'; remaining: number }
  | { status: 'provider_unavailable'; remaining: 0 };

export function allowanceWithAddons(
  snapshot: EntitlementSnapshot,
  allowance: AllowanceKey,
): number {
  if (allowance === 'advancedReports') return snapshot.allowances.advancedReports ? 1 : 0;
  return snapshot.allowances[allowance] + (snapshot.addonDeltas[allowance] ?? 0);
}

export function checkPlanAllowance(
  snapshot: EntitlementSnapshot | null,
  allowance: AllowanceKey,
  used: number,
  requested = 1,
  now = new Date(),
): AllowanceDecision {
  if (!snapshot || requested < 0 || used < 0)
    return { status: 'provider_unavailable', remaining: 0 };
  const serviceable =
    snapshot.status === 'active' ||
    snapshot.status === 'trialing' ||
    (snapshot.status === 'past_due' &&
      snapshot.graceUntil !== null &&
      now < new Date(snapshot.graceUntil));
  if (!serviceable) return { status: 'provider_unavailable', remaining: 0 };
  const limit = allowanceWithAddons(snapshot, allowance);
  // A downgrade never deletes or hides existing owned data; only positive growth is denied.
  if (requested === 0) return { status: 'allowed', remaining: Math.max(0, limit - used) };
  if (used + requested > limit)
    return { status: 'limit_reached', remaining: Math.max(0, limit - used) };
  return { status: 'allowed', remaining: limit - used - requested };
}

function addUtcClamped(date: Date, years: number, months: number): Date {
  const targetMonth = date.getUTCMonth() + months + years * 12;
  const year = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export function periodForCadence(start: Date, cadence: BillingCadence) {
  if (!Number.isFinite(start.getTime())) throw new Error('Invalid period start');
  return {
    start: start.toISOString(),
    end: addUtcClamped(
      start,
      cadence === 'annual' ? 1 : 0,
      cadence === 'monthly' ? 1 : 0,
    ).toISOString(),
  };
}

export interface AllowanceAdapter {
  check(tenantId: string, amount?: number): Promise<AllowanceDecision>;
  consume(input: {
    tenantId: string;
    operationId: string;
    amount: number;
    sourceId: string | null;
  }): Promise<ConsumeAllowanceResult>;
}
export type EmployeeAllowanceAdapter = AllowanceAdapter;
export type StorageAllowanceAdapter = AllowanceAdapter;
export type CommunicationAllowanceAdapter = AllowanceAdapter;

const consumeInput = z
  .object({
    tenantId: z.string().uuid(),
    operationId: z.string().uuid(),
    allowance: z.enum([
      'employees',
      'storageBytes',
      'invoices',
      'sms',
      'whatsapp',
      'advancedReports',
    ]),
    amount: z.number().int().positive().safe(),
    source: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/u),
    sourceId: z.string().uuid().nullable(),
  })
  .strict();
type ConsumeInput = z.infer<typeof consumeInput>;
export type ConsumeAllowanceResult = {
  status: 'allowed' | 'limit_reached' | 'provider_unavailable';
  snapshotId?: string;
  used?: number;
  limit?: number;
  replayed?: boolean;
};
type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export function consumePlanAllowance(
  client: RpcClient,
  raw: ConsumeInput,
): Promise<ConsumeAllowanceResult> {
  const input = consumeInput.parse(raw);
  return (async () => {
    const { data, error } = await client.rpc('p309_consume_plan_allowance', {
      p_tenant_id: input.tenantId,
      p_operation_id: input.operationId,
      p_allowance_key: input.allowance,
      p_amount: input.amount,
      p_source: input.source,
      p_source_id: input.sourceId,
    });
    if (error) return { status: 'provider_unavailable' };
    const value = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (
      !value ||
      !['allowed', 'limit_reached', 'provider_unavailable'].includes(String(value.status))
    )
      return { status: 'provider_unavailable' };
    return {
      status: value.status as ConsumeAllowanceResult['status'],
      snapshotId: String(value.snapshot_id ?? value.snapshotId ?? ''),
      used: Number(value.used ?? 0),
      limit: Number(value.allowance_limit ?? value.limit ?? 0),
      replayed: Boolean(value.replayed),
    };
  })();
}
