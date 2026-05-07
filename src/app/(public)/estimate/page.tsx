import type { Metadata } from 'next';
import { CostEstimator } from '@/components/estimator/CostEstimator';
import { seededCostDataRows } from '@/lib/estimator/seed-data';
import type { Jurisdiction } from '@/lib/estimator';

export const metadata: Metadata = {
  title: 'UAE Company Setup Cost Estimator | Mandoob',
  description: 'Estimate UAE Mainland, Free Zone, and Offshore company setup costs.',
};

export default function EstimatePage() {
  const authorities = uniqueAuthorities();

  return (
    <div className="bg-muted/20 min-h-screen">
      <CostEstimator authorities={authorities} />
    </div>
  );
}

function uniqueAuthorities(): { authority: string; jurisdiction: Jurisdiction; emirate: string | null }[] {
  const map = new Map<string, { authority: string; jurisdiction: Jurisdiction; emirate: string | null }>();
  for (const row of seededCostDataRows) {
    const key = `${row.jurisdiction}:${row.authority}`;
    if (!map.has(key)) {
      map.set(key, {
        authority: row.authority,
        jurisdiction: row.jurisdiction,
        emirate: row.emirate,
      });
    }
  }
  return [...map.values()];
}
