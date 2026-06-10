import Link from 'next/link';

export function ServicesSection() {
  return (
    <section id="services" className="section" aria-labelledby="services-h">
      <div className="container">
        <header className="section__head reveal">
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
              Full UAE-market trading via DED. Local agent, MOHRE permits, GDRFA visas, all managed.
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
              100% ownership across 45+ zones. We match zone to activity, visa needs, office budget.
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
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" fill="none" />
              </svg>
            </span>
            <h3>Offshore Incorporation</h3>
            <p>
              Asset-holding and international trading via JAFZA Offshore and RAK ICC, with substance
              filings.
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
          className="cell compare reveal"
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
  );
}
