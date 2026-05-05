import type { RenewalRow } from '@/lib/data/renewals';

export type RenewalBuckets = {
  d30: RenewalRow[];
  d60: RenewalRow[];
  d90: RenewalRow[];
  later: RenewalRow[];
};

export function bucketRenewals(rows: RenewalRow[]): RenewalBuckets {
  const buckets: RenewalBuckets = { d30: [], d60: [], d90: [], later: [] };
  for (const r of rows) {
    if (r.daysOut <= 30) buckets.d30.push(r);
    else if (r.daysOut <= 60) buckets.d60.push(r);
    else if (r.daysOut <= 90) buckets.d90.push(r);
    else buckets.later.push(r);
  }
  return buckets;
}
