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
          <blockquote className="cell cell--quotelg reveal">
            <p>
              &ldquo;Renewed 47 licences last month with zero late fines. The renewal calendar alone
              paid for the annual subscription twice over.&rdquo;
            </p>
            <footer>
              <span className="mono">SA</span> Sarah Al Marri · PRO Manager · Horizon, Dubai
            </footer>
          </blockquote>
          <blockquote className="cell cell--quotesm reveal">
            <p>&ldquo;Set up an IFZA company from Berlin in 9 days. No flights.&rdquo;</p>
            <footer>
              <span className="mono">JK</span> Jonas Keller · Founder · Linthos
            </footer>
          </blockquote>
          <blockquote className="cell cell--quotesm reveal">
            <p>&ldquo;The audit log sold our compliance team instantly.&rdquo;</p>
            <footer>
              <span className="mono">FH</span> Fatima Hussein · Counsel · Naseej
            </footer>
          </blockquote>
          <blockquote className="cell cell--quotesm reveal">
            <p>&ldquo;Replaced WhatsApp, Excel, and a CRM with one workspace.&rdquo;</p>
            <footer>
              <span className="mono">AK</span> Ahmed Khalifa · Partner · Khalifa Consultants
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}
