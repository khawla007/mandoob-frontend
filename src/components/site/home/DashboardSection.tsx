import { DashboardPreview } from '@/components/site/DashboardPreview';

export function DashboardSection() {
  return (
    <section id="dashboard" className="showcase" aria-labelledby="show-h">
      <div className="container">
        <header className="section__head section__head--inv reveal">
          <span className="eyebrow eyebrow--inv">04 · Dashboard</span>
          <h2 id="show-h" className="h2 h2--inv">
            One dashboard. Every client.
          </h2>
        </header>
      </div>
      <div className="container">
        <DashboardPreview />
        <div className="frame-features cards-stagger" data-reveal-cards>
          <article
            className="frame-features__cell reveal"
            data-num="01"
            aria-labelledby="ff-alerts"
          >
            <h3 id="ff-alerts">Live renewal alerts</h3>
            <p>90 / 30 / 7-day across email, WhatsApp, in-app.</p>
          </article>
          <article className="frame-features__cell reveal" data-num="02" aria-labelledby="ff-audit">
            <h3 id="ff-audit">Audit-ready</h3>
            <p>Immutable log with actor, entity, IP, timestamp.</p>
          </article>
          <article
            className="frame-features__cell reveal"
            data-num="03"
            aria-labelledby="ff-whitelabel"
          >
            <h3 id="ff-whitelabel">White-label</h3>
            <p>Custom subdomain, logo, sender per tenant.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
