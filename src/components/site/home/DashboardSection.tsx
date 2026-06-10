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
          <article className="frame-features__cell reveal" aria-labelledby="ff-alerts">
            <h4 id="ff-alerts">Live renewal alerts</h4>
            <p>90 / 30 / 7-day across email, WhatsApp, in-app.</p>
          </article>
          <article className="frame-features__cell reveal" aria-labelledby="ff-audit">
            <h4 id="ff-audit">Audit-ready</h4>
            <p>Immutable log with actor, entity, IP, timestamp.</p>
          </article>
          <article className="frame-features__cell reveal" aria-labelledby="ff-whitelabel">
            <h4 id="ff-whitelabel">White-label</h4>
            <p>Custom subdomain, logo, sender per tenant.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
