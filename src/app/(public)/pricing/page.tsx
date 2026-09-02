import Link from 'next/link';

import { PUBLIC_PRICING_CONTRACT, formatPublicPrice } from '@/lib/pricing/public-pricing';

const cadenceLabel = (cadence: 'monthly' | 'annual') =>
  `${cadence.charAt(0).toUpperCase()}${cadence.slice(1)}`;

export default function PricingPage() {
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
              <p className="pricing-hero__policy">
                Every tier supports at most one active Company per PRO.
              </p>
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
                  <dd>One active assignment on every tier</dd>
                </div>
                <div>
                  <dt>Billing concepts</dt>
                  <dd>Monthly and annual</dd>
                </div>
                <div>
                  <dt>Current availability</dt>
                  <dd>Subject to confirmation</dd>
                </div>
              </dl>
              <p>
                Exact amounts, billing terms, category allocation, and allowances are confirmed
                during a plan discussion.
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section className="pricing-tiers" aria-labelledby="pricing-tiers-title">
        <div className="container">
          <header className="pricing-tiers__head">
            <span className="eyebrow">Plan fit</span>
            <h2 id="pricing-tiers-title">Compare the workspace tiers</h2>
            <p>
              The categories below describe supported areas only. Exact allocation and current terms
              are confirmed before access.
            </p>
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
                  <p>Government and third-party costs are separate.</p>
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
    </>
  );
}
