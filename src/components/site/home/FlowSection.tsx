export function FlowSection() {
  return (
    <section id="flow" className="section" aria-labelledby="flow-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow">05 · How it works</span>
          <h2 id="flow-h" className="h2">
            From idea to trade license in 7–14 days.
          </h2>
        </header>
      </div>
      <div className="container">
        <ol className="flow" data-reveal-cards>
          <li className="flow__cell reveal">
            <span className="flow__num mono" aria-hidden="true">
              01
            </span>
            <h3>Submit</h3>
            <p>10-minute dynamic questionnaire, branched by ownership and activity.</p>
          </li>
          <li className="flow__cell reveal">
            <span className="flow__num mono" aria-hidden="true">
              02
            </span>
            <h3>Estimate</h3>
            <p>Itemized AED quote across DED, free zone, MOHRE, GDRFA, ICP, PRO.</p>
          </li>
          <li className="flow__cell reveal">
            <span className="flow__num mono" aria-hidden="true">
              03
            </span>
            <h3>Onboard</h3>
            <p>A licensed PRO firm picks up your file. Shared dashboard, signed docs.</p>
          </li>
          <li className="flow__cell reveal">
            <span className="flow__num mono" aria-hidden="true">
              04
            </span>
            <h3>Operate</h3>
            <p>License, visas, Emirates ID, renewals, tracked to the day.</p>
          </li>
        </ol>
      </div>
    </section>
  );
}
