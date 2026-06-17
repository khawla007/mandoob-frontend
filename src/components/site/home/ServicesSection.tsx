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
        <div className="cell-row cell-row--joined cell-row--svc cards-stagger" data-reveal-cards>
          <article className="cell cell--svc reveal">
            <span className="cell__mark cell__mark--num" aria-hidden="true">
              M·01
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
            <Link className="cell__link" href="/estimate?vehicle=mainland">
              Learn more
              <span className="visually-hidden"> about Mainland Registration</span>
              <span aria-hidden="true">↗</span>
            </Link>
          </article>

          <article className="cell cell--svc reveal">
            <span className="cell__mark cell__mark--num" aria-hidden="true">
              FZ·02
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
            <Link className="cell__link" href="/estimate?vehicle=free-zone">
              Learn more
              <span className="visually-hidden"> about Free Zone Setup</span>
              <span aria-hidden="true">↗</span>
            </Link>
          </article>

          <article className="cell cell--svc cell--svc-aside reveal">
            <span className="cell__mark cell__mark--num" aria-hidden="true">
              OS·03
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
            <Link className="cell__link" href="/estimate?vehicle=offshore">
              Learn more
              <span className="visually-hidden"> about Offshore Incorporation</span>
              <span aria-hidden="true">↗</span>
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
              Compare ownership, UAE-market access, office, and residence-visa eligibility across
              the three vehicles.
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
                <th scope="row">Foreign ownership</th>
                <td>100% (most activities)</td>
                <td>100%</td>
                <td>100%</td>
              </tr>
              <tr>
                <th scope="row">Trade inside UAE market</th>
                <td className="yes">
                  <span className="visually-hidden">Yes — </span>
                  <span aria-hidden="true">✓ </span>
                  Direct
                </td>
                <td>Within zone / via agent</td>
                <td className="dash">
                  <span className="visually-hidden">Not available</span>
                  <span aria-hidden="true">—</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Physical office required</th>
                <td>Yes</td>
                <td>Flexi / shared / executive</td>
                <td className="dash">
                  <span className="visually-hidden">Not required</span>
                  <span aria-hidden="true">—</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Residence visa eligibility</th>
                <td className="yes">
                  <span className="visually-hidden">Yes</span>
                  <span aria-hidden="true">✓</span>
                </td>
                <td>
                  <span className="visually-hidden">Yes, </span>
                  <span aria-hidden="true">✓ </span>
                  quota-based
                </td>
                <td className="dash">
                  <span className="visually-hidden">Not eligible</span>
                  <span aria-hidden="true">—</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Best for</th>
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
