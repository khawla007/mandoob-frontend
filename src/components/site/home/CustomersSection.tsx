const dicebear = (seed: string) =>
  `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=f3f4f6&radius=50`;

export function CustomersSection() {
  return (
    <section id="customers" className="section" aria-labelledby="cust-h">
      <div className="customers-stack container">
        <header className="section__head reveal">
          <span className="eyebrow eyebrow--accent">06 · Customers</span>
          <h2 id="cust-h" className="h2">
            Here&apos;s what our customers actually said.
          </h2>
          <p className="section__lede">Built in the UAE. Reviewed by the people who built there.</p>
        </header>

        {/* Quantified trust strip */}
        <ul className="proof-strip reveal" aria-label="Platform trust metrics">
          <li className="proof-strip__item">
            <span className="proof-strip__num">1,200+</span>
            <span className="proof-strip__lbl">Companies registered</span>
          </li>
          <li className="proof-strip__item">
            <span className="proof-strip__num">98%</span>
            <span className="proof-strip__lbl">Renewals on time</span>
          </li>
          <li className="proof-strip__item">
            <span className="proof-strip__num">11 days</span>
            <span className="proof-strip__lbl">Median setup</span>
          </li>
          <li className="proof-strip__item">
            <span className="proof-strip__num">45+</span>
            <span className="proof-strip__lbl">Free Zones supported</span>
          </li>
        </ul>

        {/* Featured pull-quote */}
        <blockquote className="qfeature reveal">
          <p className="qfeature__quote">
            &ldquo;Set up our Mainland LLC from London in 11 days. The estimator showed every
            government fee up front — final invoice matched the quote to the dirham.&rdquo;
          </p>
          <div className="qfeature__chips">
            <span className="qchip">Mainland LLC</span>
            <span className="qchip">London → Dubai</span>
            <span className="qchip qchip--accent">11 days · zero variance</span>
          </div>
          <footer className="qfeature__foot">
            <span className="qavatar qavatar--photo" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dicebear('Jonas Keller')} alt="" width={44} height={44} />
            </span>
            <span className="qwho">
              <strong>Jonas Keller</strong>
              <span>Founder · Linthos Trading</span>
            </span>
          </footer>
        </blockquote>

        {/* Supporting testimonials */}
        <div className="qrow cards-stagger" data-reveal-cards>
          <blockquote className="qcard reveal">
            <p className="qcard__quote">
              &ldquo;IFZA Free Zone company live in 9 days. Zero flights, zero surprises.&rdquo;
            </p>
            <div className="qcard__chips">
              <span className="qchip">IFZA · Free Zone</span>
              <span className="qchip qchip--accent">9 days</span>
            </div>
            <footer className="qcard__foot">
              <span className="qavatar qavatar--photo" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dicebear('Priya Ramesh')} alt="" width={36} height={36} />
              </span>
              <span className="qwho">
                <strong>Priya Ramesh</strong>
                <span>Founder · Saffron Studio</span>
              </span>
            </footer>
          </blockquote>

          <blockquote className="qcard reveal">
            <p className="qcard__quote">
              &ldquo;Renewal alerts kicked in 90 days out. Saved us the AED 25/day fine.&rdquo;
            </p>
            <div className="qcard__chips">
              <span className="qchip">Renewal tracker</span>
              <span className="qchip qchip--accent">AED 25/day saved</span>
            </div>
            <footer className="qcard__foot">
              <span className="qavatar qavatar--photo" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dicebear('Omar Bensalem')} alt="" width={36} height={36} />
              </span>
              <span className="qwho">
                <strong>Omar Bensalem</strong>
                <span>Director · Mira Holdings</span>
              </span>
            </footer>
          </blockquote>

          <blockquote className="qcard reveal">
            <p className="qcard__quote">
              &ldquo;Visas, EID, and Ejari — all tracked in one portal. Felt in control.&rdquo;
            </p>
            <div className="qcard__chips">
              <span className="qchip">PRO + HR</span>
              <span className="qchip qchip--accent">1 portal</span>
            </div>
            <footer className="qcard__foot">
              <span className="qavatar qavatar--photo" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dicebear('Lina Chen')} alt="" width={36} height={36} />
              </span>
              <span className="qwho">
                <strong>Lina Chen</strong>
                <span>Co-founder · Northstar Logistics</span>
              </span>
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}
