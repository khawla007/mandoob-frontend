import Link from 'next/link';

export function ProHeroSection() {
  return (
    <>
      <section className="hero" aria-labelledby="pro-hero-h">
        <div className="hero__overlay" aria-hidden="true" />
        <div className="container">
          <span className="eyebrow reveal reveal--mask">
            <span className="rise">
              <span className="rise__i">.AE · For PRO Firms</span>
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
                PRO
              </span>
            </span>{' '}
            <span className="rise">
              <span
                className="rise__i u-accent"
                style={{ '--rise-delay': '360ms' } as React.CSSProperties}
              >
                firm
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
                The multi-tenant operating system for UAE PRO firms. Client roster, visa workflows,
                Emirates ID tracking, renewal alerts, document vault, audit log, and white-label
                portals — one workspace, every client isolated at the row.
              </span>
            </span>
          </p>
          <div className="cta-row reveal">
            <Link className="btn btn--accent" href="/pricing">
              See Pricing
            </Link>
            <Link className="btn btn--outline" href="/register/pro">
              Register your firm
            </Link>
          </div>
        </div>
      </section>

      <section className="stats-band" aria-label="PRO firm stats">
        <div className="container">
          <dl className="hero__spec">
            <div className="hero__stat reveal">
              <dt className="hero__statL">PRO firms</dt>
              <dd className="mono hero__statV">40+</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">clients managed</dt>
              <dd className="mono hero__statV">12,400</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">fines avoided</dt>
              <dd className="mono hero__statV u-accent">AED 2.4M</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">on-time renewals</dt>
              <dd className="mono hero__statV">98%</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
