import Link from 'next/link';

export function ProHeroSection() {
  return (
    <>
      <section className="hero hero--pro" aria-labelledby="pro-hero-h">
        <div className="hero__overlay" aria-hidden="true" />
        <div className="container">
          <span className="eyebrow reveal reveal--mask">
            <span className="rise">
              <span className="rise__i">.AE · For Dedicated PROs</span>
            </span>
          </span>
          <h1 id="pro-hero-h" className="display reveal reveal--mask">
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '120ms' } as React.CSSProperties}>
                Run
              </span>
            </span>{' '}
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '200ms' } as React.CSSProperties}>
                your
              </span>
            </span>{' '}
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '280ms' } as React.CSSProperties}>
                assigned
              </span>
            </span>{' '}
            <span className="rise">
              <span
                className="rise__i u-accent"
                style={{ '--rise-delay': '360ms' } as React.CSSProperties}
              >
                company
              </span>
            </span>{' '}
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '440ms' } as React.CSSProperties}>
                without WhatsApp + Excel.
              </span>
            </span>
          </h1>
          <p className="lede reveal reveal--mask">
            <span className="rise rise--block">
              <span className="rise__i" style={{ '--rise-delay': '520ms' } as React.CSSProperties}>
                The dedicated operating system for an assigned company. Company profile, visa
                workflows, Emirates ID tracking, renewal alerts, document vault, audit log, and
                white-label portal — one active company assignment under Mandoob platform policy.
              </span>
            </span>
          </p>
          <div className="cta-row reveal">
            <Link className="btn btn--accent" href="/pricing">
              See Pricing
            </Link>
            <Link className="btn btn--outline" href="/contact">
              Contact sales
            </Link>
          </div>
        </div>
      </section>

      <section className="stats-band" aria-label="Mandoob assignment policy">
        <div className="container">
          <dl className="hero__spec">
            <div className="hero__stat reveal">
              <dt className="hero__statL">company assignment</dt>
              <dd className="mono hero__statV">ONE ACTIVE</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">authorization</dt>
              <dd className="mono hero__statV">LIVE</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">audit trail</dt>
              <dd className="mono hero__statV u-accent">IMMUTABLE</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">workspace scope</dt>
              <dd className="mono hero__statV">ISOLATED</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
