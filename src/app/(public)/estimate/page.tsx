import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
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
    <>
      <section id="estimator-hero" className="estimator-hero" aria-labelledby="estimator-title">
        <div className="estimator-hero__frame container">
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
              <span className="eyebrow eyebrow--accent">Company setup planning</span>
              <h1 id="estimator-title">UAE business setup cost estimator</h1>
              <p>
                Work through nine structured steps to see an itemized indicative estimate, recurring
                costs, assumptions, and the information that still needs confirmation.
              </p>
              <ul className="estimator-hero__expectations" aria-label="Estimator expectations">
                <li>
                  <span aria-hidden="true">01</span>
                  <strong>Indicative result</strong>
                  <small>Not a quote or invoice</small>
                </li>
                <li>
                  <span aria-hidden="true">02</span>
                  <strong>Assumptions shown</strong>
                  <small>Review each cost boundary</small>
                </li>
                <li>
                  <span aria-hidden="true">03</span>
                  <strong>Local save</strong>
                  <small>On this browser only</small>
                </li>
              </ul>
              <p className="estimator-hero__caveat">
                Costs, eligibility, documents, and timelines must be confirmed against current
                authority and third-party requirements before you proceed.
              </p>
            </div>
            <div className="estimator-hero__visual">
              <Image
                src="/company-setup/mainland-hero.webp"
                alt="Dubai skyline beside the waterfront"
                fill
                sizes="(min-width: 900px) 46vw, 100vw"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <CostEstimator source={source} initialDraft={initialDraft} />

      <section
        id="estimator-benefits"
        className="estimator-benefits"
        aria-labelledby="estimator-benefits-title"
      >
        <div className="container">
          <h2 id="estimator-benefits-title">Why use this estimator?</h2>
          <ul>
            {[
              ['Structured inputs', 'Nine guided decisions keep the planning context clear.'],
              ['Itemized values', 'One-time and annual recurring lines stay separate.'],
              ['Visible assumptions', 'Source context and confirmation points remain in view.'],
              ['Local save', 'Resume on this browser for up to 30 days when storage is available.'],
              ['Review first', 'Check the complete summary before continuing to the application.'],
            ].map(([title, body], index) => (
              <li key={title}>
                <span aria-hidden="true">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="estimator-help-limitations"
        className="estimator-help-limitations"
        aria-labelledby="estimator-help-title"
      >
        <div className="estimator-help-limitations__grid container">
          <div className="estimator-help-card">
            <span className="eyebrow">Need help choosing?</span>
            <h2 id="estimator-help-title">Review the setup paths before estimating.</h2>
            <p>
              Use the reviewed guidance to compare setup contexts, or visit Contact for the
              currently available support options.
            </p>
            <div className="estimator-help-card__actions">
              <Link className="btn btn--accent" href="/knowledge-base">
                Browse guidance
              </Link>
              <Link className="btn btn--outline" href="/contact">
                View contact options
              </Link>
            </div>
            <div className="estimator-help-card__routes" aria-label="Company setup discovery">
              <Link href="/mainland">Mainland</Link>
              <Link href="/free-zones">Free Zones</Link>
              <Link href="/offshore">Offshore</Link>
            </div>
          </div>
          <div
            className="estimator-limitations"
            role="region"
            aria-labelledby="estimator-limitations-title"
          >
            <span className="eyebrow eyebrow--accent">Before you continue</span>
            <h2 id="estimator-limitations-title">Estimate limitations</h2>
            <ul>
              <li>Displayed values are indicative and source-qualified, never guaranteed.</li>
              <li>Authority requirements and third-party costs can change.</li>
              <li>Eligibility, documents, workspace, tax, banking, and timelines need review.</li>
              <li>An estimate is not legal, tax, banking, immigration, or approval advice.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
