import Link from 'next/link';
import { PUBLIC_PRICING_CONTRACT, formatPublicPrice } from '@/lib/pricing/public-pricing';

export default function PricingPage() {
  return (
    <section className="section" aria-labelledby="pricing-h">
      <div className="container">
        <header className="section__head">
          <span className="eyebrow">Pricing</span>
          <h1 id="pricing-h" className="h2">
            Mandoob pricing
          </h1>
          <p className="lede">
            Subscription plans for dedicated UAE PRO operations across an assigned company,
            renewals, documents, and payments. Every plan follows Mandoob&apos;s one-active-company
            assignment policy.
          </p>
        </header>
      </div>
      <div className="container">
        <div className="cell-row">
          {PUBLIC_PRICING_CONTRACT.tiers.map((plan) => (
            <article key={plan.name} className="cell cell--svc">
              <span className="eyebrow">{plan.name}</span>
              <p className="cell__metric">{formatPublicPrice(plan.price)}</p>
              <p className="cell__sub">
                {plan.cadences
                  .map((cadence) => `${cadence.name} concept — ${cadence.availability.display}`)
                  .join('; ')}
              </p>
              <ul className="dash-list">
                {plan.categories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
              <Link className="btn btn--accent btn--sm" href="/contact">
                Contact sales
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
