import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { ParsedCostDataInput } from '@/lib/validation/cost-data';

export type CostDataRow = {
  id: string;
  jurisdiction: 'mainland' | 'free_zone' | 'offshore';
  authority: string;
  emirate: string | null;
  activityKey: string | null;
  feeType: string;
  label: string;
  amountMinor: number;
  currency: 'AED';
  recurrence: 'one_time' | 'annual';
  minShareholders: number;
  maxShareholders: number;
  minVisas: number;
  maxVisas: number;
  timelineMinDays: number;
  timelineMaxDays: number;
  requiredDocumentKeys: string[];
  estimateGrade: boolean;
  active: boolean;
  validFrom: string;
  validTo: string | null;
  updatedAt: string;
};

export type CostDataFilters = {
  jurisdiction?: string | null;
  q?: string | null;
  active?: 'all' | 'active' | 'inactive';
  feeType?: string | null;
  estimateGrade?: 'all' | 'yes' | 'no';
  page?: number;
  pageSize?: number;
};

export type CostDataSummary = {
  totalRows: number;
  activeRows: number;
  estimateGradeRows: number;
  uniqueAuthorities: number;
  staleRows: number;
};

type DbCostDataRow = {
  id: string;
  jurisdiction: CostDataRow['jurisdiction'];
  authority: string;
  emirate: string | null;
  activity_key: string | null;
  fee_type: string;
  label: string;
  amount_minor: number;
  currency: 'AED';
  recurrence: CostDataRow['recurrence'];
  min_shareholders: number;
  max_shareholders: number;
  min_visas: number;
  max_visas: number;
  timeline_min_days: number;
  timeline_max_days: number;
  required_document_keys: string[];
  estimate_grade: boolean;
  active: boolean;
  valid_from: string;
  valid_to: string | null;
  updated_at: string;
};

type CostDataFilterQuery<T> = {
  eq(column: string, value: string | boolean): T;
  or(filters: string): T;
};

type CostDataQueryResult = {
  data: unknown[] | null;
  error: unknown;
  count?: number | null;
};

interface CostDataQuery extends CostDataFilterQuery<CostDataQuery>, PromiseLike<CostDataQueryResult> {
  order(column: string, options?: { ascending?: boolean }): CostDataQuery;
  range(from: number, to: number): CostDataQuery;
}

const COST_DATA_SELECT = `
  id,
  jurisdiction,
  authority,
  emirate,
  activity_key,
  fee_type,
  label,
  amount_minor,
  currency,
  recurrence,
  min_shareholders,
  max_shareholders,
  min_visas,
  max_visas,
  timeline_min_days,
  timeline_max_days,
  required_document_keys,
  estimate_grade,
  active,
  valid_from,
  valid_to,
  updated_at
`;

export async function listCostDataRows(filters: CostDataFilters = {}): Promise<{ rows: CostDataRow[]; count: number }> {
  const pageSize = filters.pageSize ?? 50;
  const page = Math.max(filters.page ?? 1, 1);
  let query = applyCostDataFilters(
    createSupabaseServiceRoleClient().from('cost_data').select(COST_DATA_SELECT, { count: 'exact' }) as unknown as CostDataQuery,
    filters,
  );

  query = query
    .order('authority', { ascending: true })
    .order('fee_type', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('listCostDataRows failed', error);
    throw new Error('Could not load cost data');
  }
  return { rows: ((data ?? []) as DbCostDataRow[]).map(toCostDataRow), count: count ?? 0 };
}

export async function getCostDataSummary(): Promise<CostDataSummary> {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('cost_data')
    .select('authority, active, estimate_grade, valid_to');
  if (error) {
    console.error('getCostDataSummary failed', error);
    throw new Error('Could not load cost-data summary');
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []) as Array<{ authority: string; active: boolean; estimate_grade: boolean; valid_to: string | null }>;
  return {
    totalRows: rows.length,
    activeRows: rows.filter((row) => row.active).length,
    estimateGradeRows: rows.filter((row) => row.estimate_grade).length,
    uniqueAuthorities: new Set(rows.map((row) => row.authority)).size,
    staleRows: rows.filter((row) => row.valid_to && row.valid_to < today).length,
  };
}

export async function createCostDataRow(input: ParsedCostDataInput): Promise<CostDataRow> {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('cost_data')
    .insert(toDbWrite(input))
    .select(COST_DATA_SELECT)
    .single();
  if (error) {
    console.error('createCostDataRow failed', error);
    throw new Error('Could not create cost-data row');
  }
  return toCostDataRow(data as DbCostDataRow);
}

export async function updateCostDataRow(id: string, input: ParsedCostDataInput): Promise<CostDataRow> {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('cost_data')
    .update(toDbWrite(input))
    .eq('id', id)
    .select(COST_DATA_SELECT)
    .single();
  if (error) {
    console.error('updateCostDataRow failed', error);
    throw new Error('Could not update cost-data row');
  }
  return toCostDataRow(data as DbCostDataRow);
}

export async function setCostDataActive(id: string, active: boolean): Promise<void> {
  const { error } = await createSupabaseServiceRoleClient().from('cost_data').update({ active }).eq('id', id);
  if (error) {
    console.error('setCostDataActive failed', error);
    throw new Error('Could not update cost-data status');
  }
}

export async function listCostDataRowsForExport(filters: CostDataFilters = {}): Promise<CostDataRow[]> {
  const { data, error } = await applyCostDataFilters(
    createSupabaseServiceRoleClient().from('cost_data').select(COST_DATA_SELECT) as unknown as CostDataQuery,
    filters,
  ).order('authority', { ascending: true });
  if (error) {
    console.error('listCostDataRowsForExport failed', error);
    throw new Error('Could not export cost data');
  }
  return ((data ?? []) as DbCostDataRow[]).map(toCostDataRow);
}

function applyCostDataFilters<T extends CostDataFilterQuery<T>>(query: T, filters: CostDataFilters): T {
  let next = query;
  if (filters.jurisdiction && filters.jurisdiction !== 'all') next = next.eq('jurisdiction', filters.jurisdiction);
  if (filters.feeType && filters.feeType !== 'all') next = next.eq('fee_type', filters.feeType);
  if (filters.active === 'active') next = next.eq('active', true);
  if (filters.active === 'inactive') next = next.eq('active', false);
  if (filters.estimateGrade === 'yes') next = next.eq('estimate_grade', true);
  if (filters.estimateGrade === 'no') next = next.eq('estimate_grade', false);
  if (filters.q?.trim()) {
    const q = filters.q.trim().replaceAll('%', '').replaceAll(',', ' ');
    next = next.or(`authority.ilike.%${q}%,label.ilike.%${q}%,activity_key.ilike.%${q}%`);
  }
  return next;
}

function toDbWrite(input: ParsedCostDataInput) {
  return {
    jurisdiction: input.jurisdiction,
    authority: input.authority,
    emirate: input.emirate,
    activity_key: input.activityKey,
    fee_type: input.feeType,
    label: input.label,
    amount_minor: input.amount,
    currency: 'AED',
    recurrence: input.recurrence,
    min_shareholders: input.minShareholders,
    max_shareholders: input.maxShareholders,
    min_visas: input.minVisas,
    max_visas: input.maxVisas,
    timeline_min_days: input.timelineMinDays,
    timeline_max_days: input.timelineMaxDays,
    required_document_keys: input.requiredDocumentKeys,
    estimate_grade: input.estimateGrade,
    active: input.active,
    valid_from: input.validFrom,
    valid_to: input.validTo,
  };
}

function toCostDataRow(row: DbCostDataRow): CostDataRow {
  return {
    id: row.id,
    jurisdiction: row.jurisdiction,
    authority: row.authority,
    emirate: row.emirate,
    activityKey: row.activity_key,
    feeType: row.fee_type,
    label: row.label,
    amountMinor: row.amount_minor,
    currency: row.currency,
    recurrence: row.recurrence,
    minShareholders: row.min_shareholders,
    maxShareholders: row.max_shareholders,
    minVisas: row.min_visas,
    maxVisas: row.max_visas,
    timelineMinDays: row.timeline_min_days,
    timelineMaxDays: row.timeline_max_days,
    requiredDocumentKeys: row.required_document_keys,
    estimateGrade: row.estimate_grade,
    active: row.active,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    updatedAt: row.updated_at,
  };
}
