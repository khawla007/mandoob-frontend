import Link from 'next/link';

export function HeroSection() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-h">
        <div className="hero__overlay" aria-hidden="true" />
        <div className="container">
          <span className="eyebrow reveal reveal--mask">
            <span className="rise">
              <span className="rise__i">.AE · UAE Business Platform</span>
            </span>
          </span>
          <h1 id="hero-h" className="display reveal reveal--mask">
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '120ms' } as React.CSSProperties}>
                Set
              </span>
            </span>{' '}
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '200ms' } as React.CSSProperties}>
                up.
              </span>
            </span>{' '}
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '280ms' } as React.CSSProperties}>
                Stay
              </span>
            </span>{' '}
            <span className="rise">
              <span
                className="rise__i u-accent"
                style={{ '--rise-delay': '360ms' } as React.CSSProperties}
              >
                compliant.
              </span>
            </span>{' '}
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '440ms' } as React.CSSProperties}>
                Scale.
              </span>
            </span>
          </h1>
          <p className="lede reveal reveal--mask">
            <span className="rise rise--block">
              <span className="rise__i" style={{ '--rise-delay': '520ms' } as React.CSSProperties}>
                The multi-tenant platform for UAE company registration and PRO management. Mainland,
                Free Zone, Offshore — estimator, visas, Emirates ID, renewals, documents, and
                white-label portals in one workspace.
              </span>
            </span>
          </p>
          <div className="cta-row reveal">
            <Link className="btn btn--accent" href="/estimate">
              Get Estimate
            </Link>
            <a className="btn btn--outline" href="#pro-suite">
              View Platform
            </a>
          </div>
        </div>
      </section>

      <section className="stats-band" aria-label="Platform stats">
        <div className="container">
          <dl className="hero__spec">
            <div className="hero__stat reveal">
              <dt className="hero__statL">businesses</dt>
              <dd className="mono hero__statV">320+</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">free zones</dt>
              <dd className="mono hero__statV">45</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">fines saved</dt>
              <dd className="mono hero__statV u-accent">AED 2.4M</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">on-time</dt>
              <dd className="mono hero__statV">98%</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
