import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CostEstimator } from '@/components/estimator/CostEstimator';
import { seededCostDataRows } from '@/lib/estimator/seed-data';
import type { Jurisdiction } from '@/lib/estimator';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'estimate' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function EstimatePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const authorities = uniqueAuthorities();

  return (
    <main className="bg-muted/20 min-h-screen">
      <CostEstimator authorities={authorities} />
    </main>
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
