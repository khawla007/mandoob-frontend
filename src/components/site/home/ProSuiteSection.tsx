export function ProSuiteSection() {
  return (
    <section id="pro-suite" className="section" aria-labelledby="suite-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow">03 · Platform</span>
          <h2 id="suite-h" className="h2">
            Built for PROs managing 50 to 5,000 clients.
          </h2>
        </header>
      </div>
      <div className="container">
        <ul
          className="mosaic"
          role="list"
          aria-label="Platform capabilities"
          data-reveal-cards
        >
          <li className="cell cell--table reveal">
            <span className="eyebrow">Multi-tenant control</span>
            <h3>Every client, isolated at the row.</h3>
            <p>
              Postgres RLS enforces tenant_id on every table. Switch tenants without leaking a
              record.
            </p>
            <table className="mini-table">
              <caption className="sr-only">
                Sample tenant client roster: Acme Trading, Naseej Group, Quay Holdings.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Type</th>
                  <th scope="col">Renewal</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Acme Trading FZ-LLC</td>
                  <td>Free Zone</td>
                  <td className="mono">14 Jun</td>
                  <td>On track</td>
                </tr>
                <tr>
                  <td>Naseej Group LLC</td>
                  <td>Mainland</td>
                  <td className="mono">02 Jun</td>
                  <td>Due soon</td>
                </tr>
                <tr>
                  <td>Quay Holdings Ltd</td>
                  <td>Offshore</td>
                  <td className="mono">28 Aug</td>
                  <td>On track</td>
                </tr>
              </tbody>
            </table>
          </li>

          <li className="cell cell--log reveal">
            <span className="eyebrow">Audit trail</span>
            <h3>Stamp the visa, log the actor.</h3>
            <figure
              className="logbox-wrap"
              role="img"
              aria-label="Sample audit log: PRO stamped a visa, PRO marked an invoice paid, system fired a renewal alert."
            >
              <pre className="logbox mono" aria-hidden="true">
                <code>{`actor=pro action=visa.stamp
entity=client/9842 ip=5.32.x
ts=2026-05-18T12:42:09Z
---
actor=pro action=invoice.paid
entity=inv/1042 ip=5.32.x
ts=2026-05-18T11:55:01Z
---
actor=sys action=renewal.alert
entity=lic/acme ip=internal
ts=2026-05-18T09:00:00Z`}</code>
              </pre>
            </figure>
          </li>

          <li className="cell cell--visas reveal">
            <span className="eyebrow">Visas</span>
            <h3>Three stamps, one trail.</h3>
            <ol className="step-rail" aria-label="Visa workflow stages">
              <li>
                <span className="step-rail__n mono" aria-hidden="true">
                  01
                </span>{' '}
                Type
              </li>
              <li>
                <span className="step-rail__n mono" aria-hidden="true">
                  02
                </span>{' '}
                Medical
              </li>
              <li>
                <span className="step-rail__n mono" aria-hidden="true">
                  03
                </span>{' '}
                Stamp
              </li>
            </ol>
          </li>

          <li className="cell cell--eid reveal">
            <span className="eyebrow">Emirates ID</span>
            <h3>One source of truth.</h3>
            <p className="cell__chip mono" aria-label="Sample masked Emirates ID number">
              784-••••-•••••••-•
            </p>
            <p className="cell__sub">Expiries tracked + alerted.</p>
          </li>

          <li className="cell cell--renewals reveal">
            <span className="eyebrow">Renewals + invoicing</span>
            <h3>Zero AED 25/day fines.</h3>
            <ol
              className="reminder-rail"
              aria-label="Reminder cadence: 90, 30, and 7 days before renewal."
            >
              <li aria-hidden="true">
                <span className="mono">–90d</span>
              </li>
              <li aria-hidden="true">
                <span className="mono">–30d</span>
              </li>
              <li aria-hidden="true">
                <span className="mono">–7d</span>
              </li>
            </ol>
            <p className="cell__sub">Charge the cadence with Tap + Stripe.</p>
          </li>
        </ul>
      </div>
    </section>
  );
}
