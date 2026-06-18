import Link from 'next/link';

export default function AboutPage() {
  return (
    <>
      {/* ============ HERO ============ */}
      <section className="hero" aria-labelledby="about-h">
        <div className="container">
          <span className="eyebrow">About · Mandoob</span>
          <h1 id="about-h" className="display">
            We make UAE setup <span className="u-accent">simple.</span>
          </h1>
          <p className="lede">
            Mandoob is the multi-tenant platform that replaces WhatsApp threads, spreadsheets, and
            scattered email with one workspace for UAE company registration and PRO management.
            Built by Fanatic Coders in Downtown Dubai.
          </p>
          <div className="cta-row">
            <Link className="btn btn--accent" href="/estimate">
              Get Estimate
            </Link>
            <Link className="btn btn--outline" href="/contact">
              Talk to us
            </Link>
          </div>
        </div>
        <div className="hero__rule" aria-hidden="true" />
        <div className="container">
          <div className="hero__metrics">
            <div>
              <span className="mono hero__metric">320+</span>
              <span className="hero__metricL">businesses launched</span>
            </div>
            <div>
              <span className="mono hero__metric">45+</span>
              <span className="hero__metricL">free zones supported</span>
            </div>
            <div>
              <span className="mono hero__metric u-accent">AED 2.4M</span>
              <span className="hero__metricL">fines avoided</span>
            </div>
            <div>
              <span className="mono hero__metric">98%</span>
              <span className="hero__metricL">on-time renewals</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ MISSION ============ */}
      <section className="section" aria-labelledby="mission-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">01 · Mission</span>
            <h2 id="mission-h" className="h2">
              Compliance should never be the bottleneck.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="cell-row">
            <article className="cell">
              <h3>The problem</h3>
              <p>
                UAE businesses lose time and money to manual paperwork, missed renewal dates, and
                AED 25/day late fines. PRO firms juggle hundreds of clients across disconnected
                tools.
              </p>
            </article>
            <article className="cell">
              <h3>Our approach</h3>
              <p>
                One audited workspace: cost estimator, document collection, visa and Emirates ID
                tracking, automated renewal alerts, invoicing, and white-label client portals.
              </p>
            </article>
            <article className="cell">
              <h3>The outcome</h3>
              <p>
                Faster setups, zero surprise fees, and a complete audit trail that compliance teams
                trust — for entrepreneurs and the PRO firms that serve them.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ============ WHAT WE DO ============ */}
      <section className="section" aria-labelledby="what-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">02 · What we do</span>
            <h2 id="what-h" className="h2">
              Built for the realities of UAE business.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="why-row">
            <article className="cell cell--why">
              <h3>Built for UAE</h3>
              <p>Aligned to PDPL, MOHRE, GDRFA, ICP, and DED workflows.</p>
            </article>
            <article className="cell cell--why">
              <h3>Multi-tenant</h3>
              <p>Postgres RLS isolates every client at the row.</p>
            </article>
            <article className="cell cell--why">
              <h3>Audit-grade</h3>
              <p>Immutable logs, exportable for legal review.</p>
            </article>
            <article className="cell cell--why">
              <h3>White-label</h3>
              <p>Custom subdomain, logo, and sender per firm.</p>
            </article>
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="cta-section" aria-labelledby="about-cta-h">
        <div className="cta-section__inner container">
          <span className="eyebrow">Get started</span>
          <h2 id="about-cta-h" className="display display--cta">
            Run your free UAE setup estimate.
          </h2>
          <Link className="btn btn--accent btn--lg" href="/estimate">
            Start Estimate
          </Link>
          <p className="micro mono">No card. No call. 90 seconds.</p>
        </div>
      </section>
    </>
  );
}
