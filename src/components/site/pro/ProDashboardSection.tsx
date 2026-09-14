import { ProDashboardPreview } from './ProDashboardPreview';

export function ProDashboardSection() {
  return (
    <section id="dashboard" className="showcase showcase--pro" aria-labelledby="pro-preview-title">
      <div className="container">
        <header className="section__head section__head--inv reveal">
          <span className="eyebrow eyebrow--inv">04 · Workspace preview</span>
          <h2 id="pro-preview-title" className="h2 h2--inv">
            One workspace. At most one active assigned Company.
          </h2>
        </header>
      </div>
      <div className="container">
        <ProDashboardPreview />
      </div>
    </section>
  );
}
