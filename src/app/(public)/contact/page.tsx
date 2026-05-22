import Link from 'next/link';

export default function ContactPage() {
  return (
    <>
      {/* ============ INTRO ============ */}
      <section className="section" aria-labelledby="contact-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">Contact</span>
            <h1 id="contact-h" className="h2">
              Talk to the Mandoob team.
            </h1>
            <p className="lede">
              Questions about UAE setup, PRO subscriptions, or white-label portals? Send a note and
              a specialist replies within one business day.
            </p>
          </header>
        </div>

        <div className="container">
          <div className="cell-row cell-row--est">
            {/* contact form (static — submission not yet wired) */}
            <div className="cell">
              <form
                className="pform"
                aria-describedby="contact-note"
                // Static UI only: no backend wired yet.
              >
                <div className="pform__field">
                  <label className="pform__label" htmlFor="cf-name">
                    Full name
                  </label>
                  <input id="cf-name" name="name" type="text" placeholder="Your name" disabled />
                </div>
                <div className="pform__field">
                  <label className="pform__label" htmlFor="cf-email">
                    Email
                  </label>
                  <input
                    id="cf-email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    disabled
                  />
                </div>
                <div className="pform__field">
                  <label className="pform__label" htmlFor="cf-message">
                    Message
                  </label>
                  <textarea
                    id="cf-message"
                    name="message"
                    placeholder="How can we help?"
                    disabled
                  />
                </div>
                <button type="button" className="btn btn--accent" disabled aria-disabled="true">
                  Send message
                </button>
                <p id="contact-note" className="micro">
                  Form submission is coming soon. For now, reach us by email below.
                </p>
              </form>
            </div>

            {/* contact details */}
            <div className="cell cell--estside">
              <h3>Downtown Dubai</h3>
              <p>United Arab Emirates</p>
              <p className="mono">
                <a className="cell__link" href="mailto:hello@mandoob.ae">
                  hello@mandoob.ae <span aria-hidden="true">↗</span>
                </a>
              </p>
              <p className="micro mono">Sun–Thu · 09:00–18:00 GST</p>
              <p className="cta-secondary">
                Are you a PRO firm?{' '}
                <Link className="cell__link" href="/register/pro">
                  Book a demo <span aria-hidden="true">↗</span>
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
