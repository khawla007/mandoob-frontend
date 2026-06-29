import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CostEstimator } from '@/components/estimator/CostEstimator';
import { seededCostDataRows } from '@/lib/estimator/seed-data';
import type { Jurisdiction } from '@/lib/estimator';

export const metadata: Metadata = {
  title: 'UAE Company Setup Cost Estimator | Mandoob',
  description: 'Estimate UAE Mainland, Free Zone, and Offshore company setup costs.',
};

export default async function EstimatePage() {
  const t = await getTranslations('estimator');
  const authorities = uniqueAuthorities();

  return (
    <section className="section section--estimate" aria-labelledby="estimate-page-h">
      <div className="container">
        <header className="section__head">
          <span className="eyebrow">{t('pageEyebrow')}</span>
          <h1 id="estimate-page-h" className="h2">
            {t('pageTitle')}
          </h1>
          <p className="lede">{t('pageLede')}</p>
        </header>
      </div>
      <div className="container">
        <CostEstimator authorities={authorities} />
      </div>
    </section>
  );
}

function uniqueAuthorities(): {
  authority: string;
  jurisdiction: Jurisdiction;
  emirate: string | null;
}[] {
  const map = new Map<
    string,
    { authority: string; jurisdiction: Jurisdiction; emirate: string | null }
  >();
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
