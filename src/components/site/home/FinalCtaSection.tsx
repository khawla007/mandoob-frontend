import Link from 'next/link';

export function FinalCtaSection() {
  return (
    <section className="cta-section" aria-labelledby="cta-h">
      <div className="cta-section__inner reveal container">
        <span className="eyebrow eyebrow--accent">07 · Get started</span>
        <h2 id="cta-h" className="display display--cta">
          Run your free UAE setup estimate.
        </h2>
        <Link className="btn btn--accent btn--lg" href="/estimate" id="cta-final">
          Start Estimate
        </Link>
        <p className="micro mono">No card. No call. 90 seconds.</p>
        <div className="cta-divider" aria-hidden="true" />
        <p className="cta-secondary">
          Are you a PRO firm?{' '}
          <Link className="cell__link" href="/pro">
            See the platform for PRO firms <span aria-hidden="true">↗</span>
          </Link>
        </p>
      </div>
    </section>
  );
}
