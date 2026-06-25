export function CustomersSection() {
  return (
    <section id="customers" className="section" aria-labelledby="cust-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow">07 · Customers</span>
          <h2 id="cust-h" className="h2">
            Trusted by people who can&apos;t get it wrong.
          </h2>
        </header>
      </div>
      <div className="container">
        <div className="quote-row cards-stagger" data-reveal-cards>
          {/* TODO: replace placeholder testimonials with real customer quotes once collected. */}
          <blockquote className="cell cell--quotelg reveal">
            <p>
              &ldquo;Set up our Mainland LLC from London in 11 days. The estimator showed every
              government fee up front — final invoice matched the quote to the dirham.&rdquo;
            </p>
            <footer>
              <span className="mono">JK</span> Jonas Keller · Founder · Linthos Trading
            </footer>
          </blockquote>
          <blockquote className="cell cell--quotesm reveal">
            <p>
              &ldquo;IFZA Free Zone company live in 9 days. Zero flights, zero surprises.&rdquo;
            </p>
            <footer>
              <span className="mono">PR</span> Priya Ramesh · Founder · Saffron Studio
            </footer>
          </blockquote>
          <blockquote className="cell cell--quotesm reveal">
            <p>&ldquo;Renewal alerts kicked in 90 days out. Saved us the AED 25/day fine.&rdquo;</p>
            <footer>
              <span className="mono">OB</span> Omar Bensalem · Director · Mira Holdings
            </footer>
          </blockquote>
          <blockquote className="cell cell--quotesm reveal">
            <p>&ldquo;Visas, EID, and Ejari — all tracked in one portal. Felt in control.&rdquo;</p>
            <footer>
              <span className="mono">LC</span> Lina Chen · Co-founder · Northstar Logistics
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}
