import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { EstimateError, type CostDataRow } from './calculate';

type CostDataDbRow = {
  id: string;
  jurisdiction: CostDataRow['jurisdiction'];
  authority: string;
  emirate: string | null;
  activity_key: string | null;
  fee_type: string;
  label: string;
  amount_minor: number;
  recurrence: CostDataRow['recurrence'];
  min_shareholders: number;
  max_shareholders: number;
  min_visas: number;
  max_visas: number;
  timeline_min_days: number;
  timeline_max_days: number;
  required_document_keys: string[];
  active: boolean;
  valid_from: string;
  valid_to: string | null;
  estimate_grade: boolean;
};

const COST_DATA_COLUMNS = `
  id,
  jurisdiction,
  authority,
  emirate,
  activity_key,
  fee_type,
  label,
  amount_minor,
  recurrence,
  min_shareholders,
  max_shareholders,
  min_visas,
  max_visas,
  timeline_min_days,
  timeline_max_days,
  required_document_keys,
  active,
  valid_from,
  valid_to,
  estimate_grade
`;

export async function listActiveEstimatorCostRows(): Promise<CostDataRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from('cost_data')
    .select(COST_DATA_COLUMNS)
    .eq('active', true)
    .eq('estimate_grade', true)
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order('authority', { ascending: true });

  if (error) {
    console.error('cost_data estimator lookup failed', error);
    throw new EstimateError('MISSING_COST_DATA', 'Estimator pricing data is unavailable');
  }

  const rows = ((data ?? []) as unknown as CostDataDbRow[]).map(toCostDataRow);
  if (rows.length === 0) {
    throw new EstimateError('MISSING_COST_DATA', 'Estimator pricing data is unavailable');
  }
  return rows;
}

function toCostDataRow(row: CostDataDbRow): CostDataRow {
  return {
    id: row.id,
    jurisdiction: row.jurisdiction,
    authority: row.authority,
    emirate: row.emirate,
    activityKey: row.activity_key,
    feeType: row.fee_type,
    label: row.label,
    amountMinor: row.amount_minor,
    recurrence: row.recurrence,
    minShareholders: row.min_shareholders,
    maxShareholders: row.max_shareholders,
    minVisas: row.min_visas,
    maxVisas: row.max_visas,
    timelineMinDays: row.timeline_min_days,
    timelineMaxDays: row.timeline_max_days,
    requiredDocumentKeys: row.required_document_keys,
    active: row.active,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    estimateGrade: row.estimate_grade,
  };
}
