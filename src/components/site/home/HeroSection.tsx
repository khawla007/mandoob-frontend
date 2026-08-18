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
                Operate.
              </span>
            </span>
          </h1>
          <p className="lede reveal reveal--mask">
            <span className="rise rise--block">
              <span className="rise__i" style={{ '--rise-delay': '520ms' } as React.CSSProperties}>
                Set up your UAE company in 7 to 14 days. Mainland, Free Zone, Offshore — get an
                itemized cost estimate, submit your application, and stay compliant on visas,
                Emirates ID, and licence renewals without ever paying a late-fine.
              </span>
            </span>
          </p>
          <div className="cta-row reveal">
            <Link className="btn btn--accent" href="/estimate">
              Get Estimate
            </Link>
            <Link className="btn btn--outline" href="/apply">
              Start Application
            </Link>
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
