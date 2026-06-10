export function FlowSection() {
  return (
    <section id="flow" className="section section--flush" aria-labelledby="flow-h">
      <div className="container">
        <header className="section__head reveal">
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
  );
}
