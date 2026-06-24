export function WhyMandoobSection() {
  return (
    <section className="section" aria-labelledby="why-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow">06 · Why Mandoob</span>
          <h2 id="why-h" className="h2">
            Confident, restrained, built for UAE.
          </h2>
        </header>
      </div>
      <div className="container">
        <div className="why-row" data-reveal-cards>
          <article className="cell cell--why reveal">
            <h3>Built for UAE</h3>
            <p>Aligned to PDPL, MOHRE, GDRFA, ICP, DED.</p>
          </article>
          <article className="cell cell--why reveal">
            <h3>Replaces 6 tools</h3>
            <p>WhatsApp, Excel, Drive, invoices, CRM, reminders.</p>
          </article>
          <article className="cell cell--why reveal">
            <h3>Audit-grade</h3>
            <p>Immutable log, exportable for legal review.</p>
          </article>
          <article className="cell cell--why reveal">
            <h3>White-label ready</h3>
            <p>Custom subdomain, logo, sender per firm.</p>
          </article>
        </div>
        <div
          className="cell compare reveal"
          tabIndex={0}
          role="region"
          aria-label="Mandoob vs Manual vs Generic SaaS comparison"
        >
          <table className="compare__table">
            <caption className="visually-hidden">
              Mandoob versus manual processes versus generic SaaS
            </caption>
            <thead>
              <tr>
                <th scope="col">Capability</th>
                <th scope="col" className="us">
                  Mandoob
                </th>
                <th scope="col">Manual</th>
                <th scope="col">Generic SaaS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>UAE license tracking</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>Automated renewal alerts</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>Tenant isolation (RLS)</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>White-label portal</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>Audit log + PDPL</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>Cost estimator</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
