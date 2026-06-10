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
        <div className="mosaic" data-reveal-cards>
          <article className="cell cell--wide reveal">
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

          <article className="cell cell--tall reveal">
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

          <article className="cell reveal">
            <span className="eyebrow">Visas</span>
            <h3>Type → medical → stamp</h3>
            <p className="cell__sub">Every visa stage tracked end to end.</p>
          </article>
          <article className="cell reveal">
            <span className="eyebrow">Emirates ID</span>
            <h3>One source of truth</h3>
            <p className="cell__sub">Every ID expiry tracked and alerted.</p>
          </article>
          <article className="cell reveal">
            <span className="eyebrow">Renewals</span>
            <h3>No AED 25/day fines</h3>
            <p className="mono cell__metric">90·30·7</p>
            <p className="cell__sub">day reminders</p>
          </article>
          <article className="cell reveal">
            <span className="eyebrow">Invoices</span>
            <h3>Tap + Stripe</h3>
            <p className="cell__sub">Itemized invoices, paid online.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
