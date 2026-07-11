import { SplitImageContent } from '@/components/site/SplitImageContent';

export function WhyMandoobSection() {
  return (
    <section className="section" aria-labelledby="why-h">
      <div className="container">
        <SplitImageContent
          reverse
          mediaTone="soft"
          media={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="https://illustrations.popsy.co/orange/remote-work.svg"
              alt="Illustration of a founder running UAE company setup remotely from a laptop"
              className="split-showcase__illust"
              loading="lazy"
              decoding="async"
            />
          }
        >
          <span className="eyebrow eyebrow--accent">04 · Why Mandoob</span>
          <h2 id="why-h" className="h2">
            Confident, restrained, built for UAE.
          </h2>
          <ul className="split-showcase__list">
            <li>
              <h3>Set up in 7 to 14 days</h3>
              <p>Mainland, Free Zone, or Offshore — no flights, no chasing officials.</p>
            </li>
            <li>
              <h3>Real cost, up front</h3>
              <p>Every government fee itemized before you commit. No mark-ups, no surprises.</p>
            </li>
            <li>
              <h3>Compliance done for you</h3>
              <p>Visas, Emirates ID, renewals tracked and alerted so you never pay a late fine.</p>
            </li>
            <li>
              <h3>One workspace, end to end</h3>
              <p>Documents, signatures, invoices, and updates — all in your customer portal.</p>
            </li>
          </ul>
        </SplitImageContent>

        <div
          className="cell compare reveal"
          tabIndex={0}
          role="region"
          aria-label="Mandoob vs DIY vs Generic agency comparison"
        >
          <table className="compare__table">
            <caption className="visually-hidden">
              Mandoob versus doing it yourself versus a generic agency
            </caption>
            <thead>
              <tr>
                <th scope="col">What you get</th>
                <th scope="col" className="us">
                  Mandoob
                </th>
                <th scope="col">DIY</th>
                <th scope="col">Generic agency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Itemized cost estimate before you commit</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>Automated visa + EID + renewal alerts</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>Document vault with version history</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>Customer portal — track every step</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>Zero AED 25/day late-renewal fines</td>
                <td className="us yes">✓</td>
                <td className="dash">—</td>
                <td className="dash">—</td>
              </tr>
              <tr>
                <td>Full PDPL-compliant data handling</td>
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
