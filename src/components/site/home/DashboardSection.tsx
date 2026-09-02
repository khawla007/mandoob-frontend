import { DashboardPreview } from '@/components/site/DashboardPreview';
import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';

function ProDashboardSection() {
  const { preview } = PUBLIC_PRO_CONTENT;

  return (
    <section id="dashboard" className="showcase showcase--pro" aria-labelledby="pro-preview-title">
      <div className="container">
        <header className="section__head section__head--inv reveal">
          <span className="eyebrow eyebrow--inv">04 · Workspace preview</span>
          <h2 id="pro-preview-title" className="h2 h2--inv">
            One workspace. At most one active assigned Company.
          </h2>
          <p>{preview.description.text}</p>
        </header>
      </div>
      <div className="container">
        <DashboardPreview variant="pro" />
        <div className="frame-features cards-stagger" data-reveal-cards>
          {preview.dashboard.areas.map((area, index) => (
            <article
              key={area.label.text}
              className="frame-features__cell reveal"
              data-num={String(index + 1).padStart(2, '0')}
            >
              <h3>{area.label.text}</h3>
              <p data-source-state={area.state.source.state}>{area.state.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DashboardSection({ variant = 'home' }: { variant?: 'home' | 'pro' } = {}) {
  if (variant === 'pro') return <ProDashboardSection />;

  return (
    <section id="dashboard" className="showcase" aria-labelledby="show-h">
      <div className="container">
        <header className="section__head section__head--inv reveal">
          <span className="eyebrow eyebrow--inv">02 · Dashboard</span>
          <h2 id="show-h" className="h2 h2--inv">
            One dashboard. Your assigned company.
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
            <p>Custom subdomain, logo, and sender for the company workspace.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
