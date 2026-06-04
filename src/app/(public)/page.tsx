import Link from 'next/link';

import { DashboardPreview } from '@/components/site/DashboardPreview';
import { EstimatorPreview } from '@/components/site/EstimatorPreview';
import { ScrollReveal } from '@/components/site/ScrollReveal';

export default function MarketingHomePage() {
  return (
    <>
      <ScrollReveal />
      {/* ============ HERO ============ */}
      <section className="hero" aria-labelledby="hero-h">
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
        <div className="hero__rule" aria-hidden="true" />
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

      {/* ============ TRUSTED + STATS ============ */}
      <section className="trust-band" aria-labelledby="trust-h" data-reveal>
        <h2 id="trust-h" className="visually-hidden">
          Free zones and authorities supported
        </h2>
        <div className="logo-band">
          <div className="logo-track" aria-hidden="true">
            {/* Two identical halves so the -50% scroll loops seamlessly */}
            {[0, 1].map((half) =>
              ['DMCC', 'IFZA', 'SHAMS', 'RAKEZ', 'JAFZA', 'ADGM', 'DAFZA', 'RAK ICC'].map(
                (zone) => <span key={`${half}-${zone}`}>{zone}</span>,
              ),
            )}
          </div>
        </div>
      </section>

      {/* ============ SERVICES ============ */}
      <section id="services" className="section" aria-labelledby="services-h" data-reveal>
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">01 · Services</span>
            <h2 id="services-h" className="h2">
              Three vehicles. One platform.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="cell-row cell-row--joined cards-stagger" data-reveal-cards>
            <article className="cell cell--svc reveal">
              <span className="cell__mark" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24">
                  <rect
                    x="4"
                    y="4"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    fill="none"
                  />
                </svg>
              </span>
              <h3>Mainland Registration</h3>
              <p>
                Full UAE-market trading via DED. Local agent, MOHRE permits, GDRFA visas, all
                managed.
              </p>
              <ul className="dash-list">
                <li>DED trade license</li>
                <li>MOHRE labor file</li>
                <li>Investor + employee visas</li>
              </ul>
              <Link className="cell__link" href="/estimate">
                Learn more <span aria-hidden="true">↗</span>
              </Link>
            </article>

            <article className="cell cell--svc reveal">
              <span className="cell__mark" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24">
                  <path
                    d="M12 4l8 4.6v8.8L12 22l-8-4.6V8.6z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    fill="none"
                  />
                </svg>
              </span>
              <h3>Free Zone Setup</h3>
              <p>
                100% ownership across 45+ zones. We match zone to activity, visa needs, office
                budget.
              </p>
              <ul className="dash-list">
                <li>Zone-specific license</li>
                <li>Flexi / shared / executive offices</li>
                <li>Bundled visa quota</li>
              </ul>
              <Link className="cell__link" href="/estimate">
                Learn more <span aria-hidden="true">↗</span>
              </Link>
            </article>

            <article className="cell cell--svc reveal">
              <span className="cell__mark" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    fill="none"
                  />
                </svg>
              </span>
              <h3>Offshore Incorporation</h3>
              <p>
                Asset-holding and international trading via JAFZA Offshore and RAK ICC, with
                substance filings.
              </p>
              <ul className="dash-list">
                <li>JAFZA / RAK ICC entities</li>
                <li>Bank account introductions</li>
                <li>UBO + economic substance</li>
              </ul>
              <Link className="cell__link" href="/estimate">
                Learn more <span aria-hidden="true">↗</span>
              </Link>
            </article>
          </div>
        </div>
        <div className="container">
          <div
            className="cell compare"
            tabIndex={0}
            role="region"
            aria-label="Compare Mainland, Free Zone and Offshore (scrollable)"
          >
            <table className="compare__table">
              <caption className="visually-hidden">
                Mainland vs Free Zone vs Offshore comparison
              </caption>
              <thead>
                <tr>
                  <th scope="col">Compare</th>
                  <th scope="col">Mainland</th>
                  <th scope="col">Free Zone</th>
                  <th scope="col">Offshore</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Foreign ownership</td>
                  <td>100% (most activities)</td>
                  <td>100%</td>
                  <td>100%</td>
                </tr>
                <tr>
                  <td>Trade inside UAE market</td>
                  <td className="yes">✓ Direct</td>
                  <td>Within zone / via agent</td>
                  <td className="dash">—</td>
                </tr>
                <tr>
                  <td>Physical office required</td>
                  <td>Yes</td>
                  <td>Flexi / shared / executive</td>
                  <td className="dash">—</td>
                </tr>
                <tr>
                  <td>Residence visa eligibility</td>
                  <td className="yes">✓</td>
                  <td>✓ (quota-based)</td>
                  <td className="dash">—</td>
                </tr>
                <tr>
                  <td>Best for</td>
                  <td>Local trade &amp; services</td>
                  <td>Export, services, low cost</td>
                  <td>Asset holding / intl trade</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ============ ESTIMATOR ============ */}
      <section id="estimator" className="section" aria-labelledby="est-h" data-reveal>
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">02 · Cost estimator</span>
            <h2 id="est-h" className="h2">
              Know the full cost before you commit.
            </h2>
          </header>
          <div className="cell-row cell-row--est">
            <EstimatorPreview />
            <div className="cell cell--estside">
              <h3>No surprise fees. Ever.</h3>
              <p>
                Every government fee, free zone surcharge, MOHRE, GDRFA, ICP, and PRO line: itemized
                before you commit. The quote saves to your dashboard as a versioned PDF.
              </p>
              <Link className="cell__link" href="/estimate">
                Run a live estimate <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PRO SUITE ============ */}
      <section id="pro-suite" className="section" aria-labelledby="suite-h" data-reveal>
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">03 · Platform</span>
            <h2 id="suite-h" className="h2">
              Built for PROs managing 50 to 5,000 clients.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="mosaic">
            <article className="cell cell--wide">
              <span className="eyebrow">Multi-tenant control</span>
              <h3>Every client, isolated at the row.</h3>
              <p>
                Postgres RLS enforces tenant_id on every table. Switch tenants without leaking a
                record.
              </p>
              <table className="mini-table">
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col">Type</th>
                    <th scope="col">Renewal</th>
                    <th scope="col" className="num">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Acme Trading FZ-LLC</td>
                    <td>Free Zone</td>
                    <td className="mono">14 Jun</td>
                    <td className="num">On track</td>
                  </tr>
                  <tr>
                    <td>Naseej Group LLC</td>
                    <td>Mainland</td>
                    <td className="mono">02 Jun</td>
                    <td className="num">Due soon</td>
                  </tr>
                  <tr>
                    <td>Quay Holdings Ltd</td>
                    <td>Offshore</td>
                    <td className="mono">28 Aug</td>
                    <td className="num">On track</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <article className="cell cell--tall">
              <span className="eyebrow">Audit trail</span>
              <h3>Every action, logged.</h3>
              <pre className="logbox mono">{`actor=pro action=visa.stamp
entity=client/9842 ip=5.32.x
ts=2026-05-18T12:42:09Z
---
actor=pro action=invoice.paid
entity=inv/1042 ip=5.32.x
ts=2026-05-18T11:55:01Z
---
actor=sys action=renewal.alert
entity=lic/acme ip=internal
ts=2026-05-18T09:00:00Z`}</pre>
            </article>

            <article className="cell">
              <span className="eyebrow">Visas</span>
              <h3>Type → medical → stamp</h3>
              <p className="cell__sub">Every visa stage tracked end to end.</p>
            </article>
            <article className="cell">
              <span className="eyebrow">Emirates ID</span>
              <h3>One source of truth</h3>
              <p className="cell__sub">Every ID expiry tracked and alerted.</p>
            </article>
            <article className="cell">
              <span className="eyebrow">Renewals</span>
              <h3>No AED 25/day fines</h3>
              <p className="mono cell__metric">90·30·7</p>
              <p className="cell__sub">day reminders</p>
            </article>
            <article className="cell">
              <span className="eyebrow">Invoices</span>
              <h3>Tap + Stripe</h3>
              <p className="cell__sub">Itemized invoices, paid online.</p>
            </article>
          </div>
        </div>
      </section>

      {/* ============ DASHBOARD SHOWCASE ============ */}
      <section className="showcase" aria-labelledby="show-h" data-reveal>
        <div className="container">
          <header className="section__head section__head--inv">
            <span className="eyebrow eyebrow--inv">04 · Dashboard</span>
            <h2 id="show-h" className="h2 h2--inv">
              One dashboard. Every client.
            </h2>
          </header>
        </div>
        <div className="container">
          <DashboardPreview />
          <div className="frame-features">
            <div>
              <h4>Live renewal alerts</h4>
              <p>90 / 30 / 7-day across email, WhatsApp, in-app.</p>
            </div>
            <div>
              <h4>Audit-ready</h4>
              <p>Immutable log with actor, entity, IP, timestamp.</p>
            </div>
            <div>
              <h4>White-label</h4>
              <p>Custom subdomain, logo, sender per tenant.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="flow" className="section section--flush" aria-labelledby="flow-h" data-reveal>
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">05 · How it works</span>
            <h2 id="flow-h" className="h2">
              From idea to trade license in 7–14 days.
            </h2>
          </header>
        </div>
        <div className="container">
          <ol className="flow cards-stagger" data-reveal-cards>
            <li className="flow__cell reveal">
              <span className="flow__num mono">01</span>
              <h4>Submit</h4>
              <p>10-minute dynamic questionnaire, branched by ownership and activity.</p>
            </li>
            <li className="flow__cell reveal">
              <span className="flow__num mono">02</span>
              <h4>Estimate</h4>
              <p>Itemized AED quote across DED, free zone, MOHRE, GDRFA, ICP, PRO.</p>
            </li>
            <li className="flow__cell reveal">
              <span className="flow__num mono">03</span>
              <h4>Onboard</h4>
              <p>A licensed PRO firm picks up your file. Shared dashboard, signed docs.</p>
            </li>
            <li className="flow__cell reveal">
              <span className="flow__num mono">04</span>
              <h4>Operate</h4>
              <p>License, visas, Emirates ID, renewals — tracked to the day.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ============ WHY + COMPARE ============ */}
      <section className="section" aria-labelledby="why-h" data-reveal>
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">06 · Why Mandoob</span>
            <h2 id="why-h" className="h2">
              Confident, restrained, built for UAE.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="why-row">
            <article className="cell cell--why">
              <h4>Built for UAE</h4>
              <p>Aligned to PDPL, MOHRE, GDRFA, ICP, DED.</p>
            </article>
            <article className="cell cell--why">
              <h4>Replaces 6 tools</h4>
              <p>WhatsApp, Excel, Drive, invoices, CRM, reminders.</p>
            </article>
            <article className="cell cell--why">
              <h4>Audit-grade</h4>
              <p>Immutable log, exportable for legal review.</p>
            </article>
            <article className="cell cell--why">
              <h4>White-label ready</h4>
              <p>Custom subdomain, logo, sender per firm.</p>
            </article>
          </div>
        </div>
      </section>

      {/* ============ TRUST & COMPLIANCE ============ */}
      <section id="trust" className="section" aria-labelledby="trustsec-h" data-reveal>
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">07 · Trust</span>
            <h2 id="trustsec-h" className="h2">
              Security and compliance, by design.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="why-row">
            <article className="cell cell--why">
              <h4>PDPL-aligned</h4>
              <p>
                Built to UAE Federal Decree-Law No. 45 of 2021 — consent tracking and right to
                erasure.
              </p>
            </article>
            <article className="cell cell--why">
              <h4>Immutable audit trail</h4>
              <p>
                Every action logged with actor, entity, IP, and timestamp. Exportable for legal
                review.
              </p>
            </article>
            <article className="cell cell--why">
              <h4>Tenant isolation</h4>
              <p>
                Postgres row-level security enforces tenant_id on every table. No cross-tenant
                leaks.
              </p>
            </article>
            <article className="cell cell--why">
              <h4>Encrypted end to end</h4>
              <p>
                TLS 1.3 in transit, AES-256 at rest, plus app-layer encryption for passport, EID,
                and visa data.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="cta-section" aria-labelledby="cta-h" data-reveal>
        <div className="cta-section__inner container">
          <span className="eyebrow">08 · Get started</span>
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
            <Link className="cell__link" href="/register/pro">
              Book the platform demo <span aria-hidden="true">↗</span>
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
