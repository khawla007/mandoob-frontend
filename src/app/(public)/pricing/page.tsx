import Link from 'next/link';
import { formatMoney } from '@/lib/format/money';

const plans = [
  {
    name: 'Starter',
    price: 4900,
    features: ['Company workspace', 'Document requests', 'Renewal alerts'],
  },
  {
    name: 'Professional',
    price: 9900,
    features: ['Payments', 'WhatsApp + SMS', 'Audit exports'],
  },
  {
    name: 'Enterprise',
    price: 19900,
    features: ['Assignment controls', 'Advanced audit', 'Priority support'],
  },
];

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
          {plans.map((plan) => (
            <article key={plan.name} className="cell cell--svc">
              <span className="eyebrow">{plan.name}</span>
              <p className="cell__metric">{formatMoney(plan.price, 'USD')}</p>
              <p className="cell__sub">/ month</p>
              <ul className="dash-list">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
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
