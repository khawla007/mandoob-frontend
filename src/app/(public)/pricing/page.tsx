import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicConversionBand } from '@/components/site/about-contact/PublicConversionBand';
import {
  PUBLIC_PRICING_CONTRACT,
  formatPublicPrice,
  resolvePublicComparisonStatus,
} from '@/lib/pricing/public-pricing';

export const metadata: Metadata = {
  title: 'Mandoob Pricing',
  description: 'Compare Mandoob workspace plan concepts for a PRO operating one assigned Company.',
  alternates: { canonical: 'https://mandoob.ae/pricing' },
};

const cadenceLabel = (cadence: 'monthly' | 'annual') =>
  `${cadence.charAt(0).toUpperCase()}${cadence.slice(1)}`;

export default function PricingPage() {
  const { publicationSummary, costBoundaries } = PUBLIC_PRICING_CONTRACT;

  return (
    <>
      <section className="pricing-hero" aria-labelledby="pricing-title">
        <div className="pricing-hero__frame container">
          <nav className="pricing-breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li aria-current="page">Pricing</li>
            </ol>
          </nav>

          <div className="pricing-hero__grid">
            <div className="pricing-hero__copy">
              <span className="eyebrow eyebrow--accent">Plans and access</span>
              <h1 id="pricing-title">Workspace plans for one assigned Company</h1>
              <p className="pricing-hero__lede">
                Compare Mandoob subscription concepts for a focused PRO workspace, operating
                records, and supported Company workflows.
              </p>
              <p className="pricing-hero__policy">{publicationSummary.companyPolicy.text}.</p>
              <div className="cta-row pricing-hero__actions">
                <Link className="btn btn--accent btn--lg" href="/contact">
                  Discuss plans
                </Link>
                <Link className="btn btn--outline btn--lg" href="/pro">
                  Explore PRO fit
                </Link>
              </div>
            </div>

            <aside className="pricing-hero__context" aria-label="Plan publication context">
              <span className="eyebrow">Published plan basis</span>
              <dl>
                <div>
                  <dt>Company policy</dt>
                  <dd>{publicationSummary.companyPolicy.text}</dd>
                </div>
                <div>
                  <dt>Billing concepts</dt>
                  <dd>{publicationSummary.billingConcepts.text}</dd>
                </div>
                <div>
                  <dt>Current availability</dt>
                  <dd>{publicationSummary.currentAvailability.text}</dd>
                </div>
              </dl>
              <p>{publicationSummary.confirmationNotice.text}</p>
            </aside>
          </div>
        </div>
      </section>

      <section className="pricing-tiers" aria-labelledby="pricing-tiers-title">
        <div className="container">
          <header className="pricing-tiers__head">
            <span className="eyebrow">Plan fit</span>
            <h2 id="pricing-tiers-title">Compare the workspace tiers</h2>
            <p>{publicationSummary.categoryAllocationNotice.text}</p>
          </header>

          <div className="pricing-tier-grid">
            {PUBLIC_PRICING_CONTRACT.tiers.map((plan, index) => (
              <article
                key={plan.id}
                className="pricing-tier-card"
                data-pricing-tier={plan.id}
                aria-labelledby={`pricing-tier-${plan.id}`}
              >
                <header className="pricing-tier-card__head">
                  <span className="pricing-tier-card__index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <span className="eyebrow">{plan.name}</span>
                    <h3 id={`pricing-tier-${plan.id}`}>{plan.name} plan</h3>
                  </div>
                </header>

                <p className="pricing-tier-card__fit">{plan.intendedFit}</p>

                <div className="pricing-tier-card__price">
                  <span>Current price state</span>
                  <strong>{formatPublicPrice(plan.price)}</strong>
                </div>

                <div className="pricing-tier-card__cadence" aria-label={`${plan.name} billing`}>
                  {plan.cadences.map((cadence) => (
                    <p key={cadence.name}>
                      <span>{cadenceLabel(cadence.name)} concept</span>
                      {cadence.availability.display}
                    </p>
                  ))}
                </div>

                <div className="pricing-tier-card__capabilities">
                  <h4>Supported category groups</h4>
                  <ul>
                    {plan.categories.map((category) => (
                      <li key={category}>{category}</li>
                    ))}
                  </ul>
                </div>

                <div className="pricing-tier-card__boundaries">
                  <p className="pricing-tier-card__company">{plan.companyPolicy}</p>
                  <p>{publicationSummary.separateCostsNotice.text}</p>
                  <p>{plan.caveat}</p>
                </div>

                <Link className="btn btn--accent" href="/contact">
                  Request {plan.name} plan information
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-comparison" aria-labelledby="pricing-comparison-title">
        <div className="container">
          <header className="pricing-section__head">
            <div>
              <span className="eyebrow">Capability comparison</span>
              <h2 id="pricing-comparison-title">Compare the published plan specification.</h2>
            </div>
            <p>{PUBLIC_PRICING_CONTRACT.comparison.summary.text}</p>
          </header>

          <div
            className="pricing-comparison__table-wrap"
            role="region"
            aria-label="Plan capability comparison"
            tabIndex={0}
          >
            <table>
              <caption>{PUBLIC_PRICING_CONTRACT.comparison.caption.text}</caption>
              <thead>
                <tr>
                  <th scope="col">Capability group</th>
                  {PUBLIC_PRICING_CONTRACT.tiers.map((tier) => (
                    <th scope="col" key={tier.id}>
                      {tier.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PUBLIC_PRICING_CONTRACT.comparison.rows.map((row) => (
                  <tr key={row.group}>
                    <th scope="row">
                      <strong>{row.group}</strong>
                      <span>{row.detail}</span>
                    </th>
                    {PUBLIC_PRICING_CONTRACT.tiers.map((tier) => {
                      const allocation = row.tiers[tier.id];
                      const status = resolvePublicComparisonStatus(allocation, {
                        tierId: tier.id,
                        capabilityGroup: row.group,
                      });
                      return (
                        <td key={tier.id}>
                          <span
                            className="pricing-comparison__status"
                            data-comparison-status={status}
                          >
                            {status}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="pricing-costs" aria-labelledby="pricing-costs-title">
        <div className="container">
          <header className="pricing-section__head">
            <div>
              <span className="eyebrow">Cost boundaries</span>
              <h2 id="pricing-costs-title">Know what sits inside and outside the platform.</h2>
            </div>
            <p>{costBoundaries.variabilityNotice.text}</p>
          </header>

          <div className="pricing-costs__grid">
            <article className="pricing-cost-panel pricing-cost-panel--platform">
              <span className="pricing-cost-panel__index" aria-hidden="true">
                01
              </span>
              <h3>Platform access</h3>
              <p>{costBoundaries.softwareAccess.description.text}</p>
              <ul>
                {costBoundaries.softwareAccess.categories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
            </article>

            <article className="pricing-cost-panel">
              <span className="pricing-cost-panel__index" aria-hidden="true">
                02
              </span>
              <h3>Government and authority costs</h3>
              <p>{costBoundaries.governmentAndAuthority.description.text}</p>
              <ul>
                {costBoundaries.governmentAndAuthority.categories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
            </article>

            <article className="pricing-cost-panel pricing-cost-panel--wide">
              <span className="pricing-cost-panel__index" aria-hidden="true">
                03
              </span>
              <h3>Additional and third-party costs</h3>
              <p>{costBoundaries.thirdParty.description.text}</p>
              <ul>
                {costBoundaries.thirdParty.categories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
                <li>{costBoundaries.otherThirdParties.text}</li>
              </ul>
            </article>
          </div>

          <div className="pricing-costs__estimate">
            <div>
              <span className="eyebrow">Company-setup planning</span>
              <p>{costBoundaries.finalEstimateNotice.text}</p>
            </div>
            <Link className="btn btn--outline" href={costBoundaries.estimateLink.href}>
              {costBoundaries.estimateLink.label}
            </Link>
          </div>
        </div>
      </section>

      <section className="pricing-access" aria-labelledby="pricing-access-title">
        <div className="container">
          <header className="pricing-section__head">
            <div>
              <span className="eyebrow">Plan access</span>
              <h2 id="pricing-access-title">How plan access works.</h2>
            </div>
            <p>{PUBLIC_PRICING_CONTRACT.accessProcess.intro.text}</p>
          </header>

          <ol className="pricing-process">
            {PUBLIC_PRICING_CONTRACT.accessProcess.steps.map((step, index) => (
              <li key={step.id} data-pricing-process-step={step.id}>
                <span className="pricing-process__number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                {step.id === 'discuss-verify' ? <Link href="/contact">Discuss plans</Link> : null}
              </li>
            ))}
          </ol>

          <aside
            className="pricing-access__unavailable"
            aria-labelledby="pricing-unavailable-title"
          >
            <h3 id="pricing-unavailable-title">Unavailable plan actions</h3>
            <ul>
              <li>
                <strong>Registration</strong>
                <span>{PUBLIC_PRICING_CONTRACT.accessProcess.registration.text}</span>
              </li>
              <li>
                <strong>Checkout and provider</strong>
                <span>{PUBLIC_PRICING_CONTRACT.accessProcess.checkout.text}</span>
              </li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="pricing-faq" aria-labelledby="pricing-faq-title">
        <div className="container">
          <header className="pricing-section__head">
            <div>
              <span className="eyebrow">Pricing FAQ</span>
              <h2 id="pricing-faq-title">Plan questions, answered carefully.</h2>
            </div>
            <p>{PUBLIC_PRICING_CONTRACT.faqIntro.text}</p>
          </header>

          <div className="pricing-faq__grid">
            {PUBLIC_PRICING_CONTRACT.faq.map((item) => (
              <details key={item.id} className="pricing-faq__item" data-pricing-faq={item.id}>
                <summary>{item.question}</summary>
                <p>
                  {item.answer.fragments.map((fragment, index) => (
                    <span key={`${item.id}-${fragment.source.state}-${index}`}>
                      {index > 0 ? ' ' : null}
                      {fragment.text}
                    </span>
                  ))}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <PublicConversionBand
        headingId="pricing-final-cta-title"
        title={PUBLIC_PRICING_CONTRACT.finalCta.title.text}
        description={PUBLIC_PRICING_CONTRACT.finalCta.description.text}
        primaryCta={PUBLIC_PRICING_CONTRACT.finalCta.links[0]}
        secondaryCta={PUBLIC_PRICING_CONTRACT.finalCta.links[1]}
      />
    </>
  );
}
