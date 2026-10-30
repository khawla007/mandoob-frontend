/** Pure renewal row projection helpers shared by server loaders (no runtime dependencies). */
export const RENEWAL_COLUMNS =
  'id, tenant_id, company_id, type, label, due_date, status, stage, version, employee_id, blocker_code, government_fee_minor, pro_service_fee_minor, fine_minor, currency, source, completed_at, created_at, updated_at';

export type RenewalCosts = {
  governmentFeeMinor: number;
  proServiceFeeMinor: number;
  fineMinor: number;
  currency: string;
};

export function renewalCostsFromRow(r: {
  government_fee_minor?: number | null;
  pro_service_fee_minor?: number | null;
  fine_minor?: number | null;
  currency?: string | null;
}): RenewalCosts {
  return {
    governmentFeeMinor: Number(r.government_fee_minor ?? 0),
    proServiceFeeMinor: Number(r.pro_service_fee_minor ?? 0),
    fineMinor: Number(r.fine_minor ?? 0),
    currency: r.currency ?? 'AED',
  };
}
