import type { Metadata } from 'next';
import Link from 'next/link';
import { Calculator, ShieldCheck } from 'lucide-react';
import { CostEstimator } from '@/components/estimator/CostEstimator';
import { getPublicEstimatorSource } from '@/lib/estimator/public-catalog';
import { EMPTY_ESTIMATOR_DRAFT, parseEstimatorPrefill } from '@/lib/estimator/public-draft';

export const metadata: Metadata = {
  title: 'UAE Company Setup Cost Estimator | Mandoob',
  description:
    'Build an indicative UAE company setup estimate with itemized assumptions, recurring costs, timeline guidance, and document requirements.',
  alternates: { canonical: '/estimate' },
};

type EstimateSearchParams = Record<string, string | string[] | undefined>;

export default async function EstimatePage({
  searchParams,
}: {
  searchParams: Promise<EstimateSearchParams>;
}) {
  const search = await searchParams;
  const evidenceState =
    process.env.NODE_ENV === 'development' &&
    typeof search.__estimator_state === 'string' &&
    ['unavailable', 'error', 'no-match'].includes(search.__estimator_state)
      ? (search.__estimator_state as 'unavailable' | 'error' | 'no-match')
      : undefined;
  const source = getPublicEstimatorSource(process.env.NODE_ENV, evidenceState);
  const initialDraft =
    source.status === 'ready' || source.status === 'indicative-demo'
      ? { ...EMPTY_ESTIMATOR_DRAFT, ...parseEstimatorPrefill(search, source.catalog) }
      : EMPTY_ESTIMATOR_DRAFT;

  return (
    <div className="estimator-page">
      <section id="estimator-hero" className="estimator-hero" aria-labelledby="estimator-title">
        <div className="container">
          <nav className="estimator-breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li aria-current="page">Cost estimator</li>
            </ol>
          </nav>
          <div className="estimator-hero__grid">
            <div className="estimator-hero__copy">
              <h1 id="estimator-title">Cost estimator</h1>
              <p>
                Get an indicative, itemised estimate for your UAE business setup. Provide a few
                details and see your one-time and recurring cost breakdown.
              </p>
            </div>
            <div className="estimator-hero__card">
              <span className="estimator-hero__card-icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <div>
                <strong>Transparent, itemised estimates</strong>
                <p>
                  See a clear breakdown of one-time and recurring costs, with assumptions shown. Not
                  a quote or invoice.
                </p>
              </div>
              <span className="estimator-hero__card-art" aria-hidden="true">
                <Calculator />
              </span>
            </div>
          </div>
        </div>
      </section>

      <CostEstimator source={source} initialDraft={initialDraft} />

      <section
        id="estimator-assurance"
        className="estimator-assurance"
        aria-labelledby="estimator-assurance-title"
      >
        <div className="container">
          <div className="estimator-assurance__band">
            <span className="estimator-assurance__icon" aria-hidden="true">
              <ShieldCheck />
            </span>
            <div className="estimator-assurance__copy">
              <h2 id="estimator-assurance-title">Transparent. Reliable. Hassle-free.</h2>
              <p>
                We simplify the process so you can focus on growing your business. Costs and
                timelines are confirmed against current authority requirements before you proceed.
              </p>
            </div>
            <div className="estimator-assurance__actions">
              <Link className="btn btn--accent" href="/apply">
                Start registration
              </Link>
              <Link className="btn btn--outline" href="/contact">
                Talk to an expert
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
