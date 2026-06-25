import Link from 'next/link';

export function ProFinalCtaSection() {
  return (
    <section className="cta-section" aria-labelledby="pro-cta-h">
      <div className="cta-section__inner reveal container">
        <span className="eyebrow">06 · Get started</span>
        <h2 id="pro-cta-h" className="display display--cta">
          Ready to operate at scale?
        </h2>
        <Link className="btn btn--accent btn--lg" href="/pricing" id="pro-cta-final">
          See Pricing
        </Link>
        <p className="micro mono">Three tiers. AED-billed. No setup fee.</p>
        <div className="cta-divider" aria-hidden="true" />
        <p className="cta-secondary">
          Already decided?{' '}
          <Link className="cell__link" href="/register/pro">
            Register your firm <span aria-hidden="true">↗</span>
          </Link>
        </p>
      </div>
    </section>
  );
}
