import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  authoritySetupPages,
  buildFaqJsonLd,
  getAuthorityPageBySlug,
  type AuthorityPageData,
} from '@/lib/knowledge-base';

type Params = { authoritySlug: string };

const DOCUMENT_LABELS: Record<string, string> = {
  attested_documents: 'Attested corporate documents',
  business_plan: 'Business plan or activity summary',
  lease_agreement: 'Lease or flexi desk confirmation',
  medical_fitness: 'Medical fitness and Emirates ID documents',
  passport: 'Passport copy',
  photo: 'Passport photo',
  shareholder_resolution: 'Shareholder resolution',
  trade_license: 'Trade license copy',
};

export function generateStaticParams() {
  return authoritySetupPages.map((page) => ({ authoritySlug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { authoritySlug } = await params;
  const page = getAuthorityPageBySlug(authoritySlug);

  if (!page) return {};

  return {
    title: `${page.authority} Company Setup Cost Guide | Mandoob`,
    description: page.description,
    keywords: page.keywords,
    alternates: {
      canonical: `/company-setup/${page.slug}`,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `/company-setup/${page.slug}`,
      type: 'article',
    },
  };
}

export default async function AuthoritySetupPage({ params }: { params: Promise<Params> }) {
  const { authoritySlug } = await params;
  const page = getAuthorityPageBySlug(authoritySlug);

  if (!page) notFound();

  const faq = buildAuthorityFaq(page);
  const faqJsonLd = buildFaqJsonLd(faq);

  return (
    <>
      <JsonLd data={faqJsonLd} />

      <section className="hero" aria-labelledby="auth-h">
        <div className="container">
          <div className="cta-row">
            <span className="eyebrow">{jurisdictionLabel(page.jurisdiction)}</span>
            {page.emirate ? <span className="eyebrow">{emirateLabel(page.emirate)}</span> : null}
          </div>
          <h1 id="auth-h" className="display">
            <span className="u-accent">{page.authority}</span>
            {page.title.slice(page.authority.length)}
          </h1>
          <p className="lede">{page.description}</p>
          <div className="cta-row">
            <Link className="btn btn--accent btn--lg" href={relativeEstimateHref(page.handoffUrl)}>
              Estimate {page.authority} setup
            </Link>
            <Link className="btn btn--outline btn--lg" href="/knowledge-base">
              Browse Knowledge Base
            </Link>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="auth-cost-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">01 · Cost</span>
            <h2 id="auth-cost-h" className="h2">
              Indicative setup cost positioning.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="cell-row">
            <article className="cell">
              <p>{page.setupCostPositioning}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="auth-timeline-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">02 · Timeline</span>
            <h2 id="auth-timeline-h" className="h2">
              Expected timeline.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="cell-row">
            <article className="cell">
              <p>
                A straightforward {page.authority} setup is currently modeled at{' '}
                <strong className="mono">
                  {page.timelineDays.min}-{page.timelineDays.max} days
                </strong>{' '}
                before add-on services, immigration steps, or authority-specific approvals.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="auth-docs-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">03 · Documents</span>
            <h2 id="auth-docs-h" className="h2">
              Common document checklist.
            </h2>
          </header>
        </div>
        <div className="container">
          <ul className="kb-grid kb-grid--3">
            {page.requiredDocumentKeys.map((key) => (
              <li key={key} className="cell">
                <h3>{DOCUMENT_LABELS[key] ?? key.replace(/_/g, ' ')}</h3>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="auth-faq-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">04 · FAQ</span>
            <h2 id="auth-faq-h" className="h2">
              Frequently asked questions.
            </h2>
          </header>
        </div>
        <div className="container">
          <ul className="kb-grid kb-grid--3">
            {faq.map((item) => (
              <li key={item.question} className="cell">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="auth-plan-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">05 · Plan</span>
            <h2 id="auth-plan-h" className="h2">
              Plan this setup.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="cell-row">
            <article className="cell">
              <span className="eyebrow">Estimator</span>
              <h3>Plan this setup</h3>
              <p>
                Open the estimator with {page.authority} preselected and adjust visas, shareholders,
                office type, and add-ons.
              </p>
              <div className="cta-row">
                <Link
                  className="btn btn--accent btn--sm"
                  href={relativeEstimateHref(page.handoffUrl)}
                >
                  Open estimator
                </Link>
              </div>
            </article>
            <article className="cell">
              <span className="eyebrow">Assumptions</span>
              <h3>What this estimate assumes</h3>
              <ul>
                {page.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="cta-section" aria-labelledby="auth-cta-h">
        <div className="cta-section__inner container">
          <span className="eyebrow">Next step</span>
          <h2 id="auth-cta-h" className="display display--cta">
            Ready to model your <span className="u-accent">{page.authority}</span> setup?
          </h2>
          <div className="cta-row">
            <Link className="btn btn--accent btn--lg" href={relativeEstimateHref(page.handoffUrl)}>
              Open estimator
            </Link>
            <Link className="btn btn--outline btn--lg" href="/knowledge-base">
              Browse Knowledge Base
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function buildAuthorityFaq(page: AuthorityPageData) {
  return [
    {
      question: `How much does ${page.authority} company setup cost?`,
      answer: `${page.setupCostPositioning} Use the estimator to model visas, shareholders, office type, and add-ons.`,
    },
    {
      question: `How long does ${page.authority} setup take?`,
      answer: `The current public model estimates ${page.timelineDays.min}-${page.timelineDays.max} days for core setup components before special approvals or post-license services.`,
    },
    {
      question: `Is this ${page.authority} fee data official?`,
      answer:
        'No. Mandoob public pages use estimate-grade planning data. Final authority pricing must be confirmed before submission or payment.',
    },
  ];
}

function relativeEstimateHref(handoffUrl: string): string {
  const url = new URL(handoffUrl);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function jurisdictionLabel(jurisdiction: AuthorityPageData['jurisdiction']): string {
  if (jurisdiction === 'free_zone') return 'Free Zone';
  if (jurisdiction === 'mainland') return 'Mainland';
  return 'Offshore';
}

function emirateLabel(emirate: string): string {
  return emirate
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
