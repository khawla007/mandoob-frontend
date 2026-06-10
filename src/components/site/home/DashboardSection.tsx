import { DashboardPreview } from '@/components/site/DashboardPreview';

export function DashboardSection() {
  return (
    <section className="showcase" aria-labelledby="show-h">
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
        <div className="frame-features" data-reveal-cards>
          <div className="reveal">
            <h4>Live renewal alerts</h4>
            <p>90 / 30 / 7-day across email, WhatsApp, in-app.</p>
          </div>
          <div className="reveal">
            <h4>Audit-ready</h4>
            <p>Immutable log with actor, entity, IP, timestamp.</p>
          </div>
          <div className="reveal">
            <h4>White-label</h4>
            <p>Custom subdomain, logo, sender per tenant.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
