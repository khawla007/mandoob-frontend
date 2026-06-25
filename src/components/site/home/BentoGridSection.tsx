import {
  BellRing,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  History,
  ImageIcon,
  Users,
} from 'lucide-react';

export function BentoGridSection() {
  return (
    <section id="bento" className="section" aria-labelledby="bento-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow">03 · Inside the product</span>
          <h2 id="bento-h" className="h2">
            Every workflow a PRO firm runs, in one place.
          </h2>
        </header>
      </div>

      <div className="container">
        <ul
          className="bento-grid"
          role="list"
          aria-label="Product surface preview"
          data-reveal-cards
        >
          {/* Tile A — Featured: Kanban lead board with micro-loop */}
          <li className="bento-tile bento-tile--feature reveal" aria-label="Lead board demo">
            <div className="bento-tile__head">
              <span className="eyebrow">Lead board</span>
              <span className="bento-tile__live mono" aria-hidden="true">
                live
              </span>
            </div>
            <h3 className="bento-tile__title">Drag leads. Trigger workflows.</h3>
            <div className="bento-kanban" aria-hidden="true">
              <div className="bento-kanban__col">
                <header>
                  <span>New</span>
                  <span className="mono">2</span>
                </header>
                <div className="bento-kanban__card">
                  <span className="bento-kanban__name">Naseej Group</span>
                  <span className="bento-kanban__meta mono">DMCC · L1</span>
                </div>
                <div className="bento-kanban__card bento-kanban__card--ghost">
                  {/* slot left when the moving card lifts out */}
                </div>
              </div>
              <div className="bento-kanban__col">
                <header>
                  <span>In progress</span>
                  <span className="mono">3</span>
                </header>
                <div className="bento-kanban__card">
                  <span className="bento-kanban__name">Acme Trading FZ-LLC</span>
                  <span className="bento-kanban__meta mono">IFZA · L2</span>
                </div>
                <div className="bento-kanban__card bento-kanban__card--mover">
                  <span className="bento-kanban__name">Quay Holdings</span>
                  <span className="bento-kanban__meta mono">SHAMS · L3</span>
                </div>
              </div>
              <div className="bento-kanban__col">
                <header>
                  <span>Won</span>
                  <span className="mono">1</span>
                </header>
                <div className="bento-kanban__card bento-kanban__card--won">
                  <span className="bento-kanban__name">Atlas Logistics</span>
                  <span className="bento-kanban__meta mono">JAFZA · L4</span>
                </div>
              </div>
            </div>
          </li>

          {/* Tile B — Renewal alert toasts */}
          <li className="bento-tile bento-tile--renewals reveal" aria-label="Renewal alerts demo">
            <div className="bento-tile__head">
              <span className="bento-tile__icon" aria-hidden="true">
                <BellRing size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Renewal alerts</span>
            </div>
            <h3 className="bento-tile__title">Never miss a 25 AED/day fine.</h3>
            <ul className="bento-toasts" role="list" aria-hidden="true">
              <li className="bento-toast bento-toast--danger">
                <span className="bento-toast__mark mono">–12d</span>
                <div>
                  <span className="bento-toast__title">Trade license — Acme Trading</span>
                  <span className="bento-toast__sub mono">Renew before 14 Jun</span>
                </div>
              </li>
              <li className="bento-toast bento-toast--warn">
                <span className="bento-toast__mark mono">–30d</span>
                <div>
                  <span className="bento-toast__title">Visa — Sarah Al Marri</span>
                  <span className="bento-toast__sub mono">Medical due 02 Jul</span>
                </div>
              </li>
              <li className="bento-toast bento-toast--ok">
                <span className="bento-toast__mark mono">–90d</span>
                <div>
                  <span className="bento-toast__title">Ejari — Quay Holdings</span>
                  <span className="bento-toast__sub mono">Scheduled, on track</span>
                </div>
              </li>
            </ul>
          </li>

          {/* Tile C — Document vault */}
          <li className="bento-tile bento-tile--docs reveal" aria-label="Document vault demo">
            <div className="bento-tile__head">
              <span className="bento-tile__icon" aria-hidden="true">
                <FileText size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Document vault</span>
            </div>
            <h3 className="bento-tile__title">Versioned. Encrypted. Auditable.</h3>
            <ul className="bento-docs" role="list" aria-hidden="true">
              <li>
                <span className="bento-docs__type bento-docs__type--pdf mono">PDF</span>
                <span className="bento-docs__name">trade_license_acme_2026.pdf</span>
                <span className="bento-docs__ver mono">v3</span>
              </li>
              <li>
                <span className="bento-docs__type bento-docs__type--img mono">
                  <ImageIcon size={11} strokeWidth={1.75} />
                </span>
                <span className="bento-docs__name">passport_sarah.png</span>
                <span className="bento-docs__ver mono">v1</span>
              </li>
              <li>
                <span className="bento-docs__type bento-docs__type--pdf mono">PDF</span>
                <span className="bento-docs__name">moa_quay_holdings.pdf</span>
                <span className="bento-docs__ver mono">v2</span>
              </li>
              <li>
                <span className="bento-docs__type bento-docs__type--doc mono">DOC</span>
                <span className="bento-docs__name">visa_application_jonas.docx</span>
                <span className="bento-docs__ver mono">v1</span>
              </li>
            </ul>
          </li>

          {/* Tile D — Multi-tenant switcher */}
          <li className="bento-tile bento-tile--tenant reveal" aria-label="Tenant switcher demo">
            <div className="bento-tile__head">
              <span className="bento-tile__icon" aria-hidden="true">
                <Building2 size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Multi-tenant</span>
            </div>
            <h3 className="bento-tile__title">White-label, one login.</h3>
            <div className="bento-tenant" aria-hidden="true">
              <div className="bento-tenant__active">
                <span className="bento-tenant__avatar" data-letter="N" />
                <div>
                  <span className="bento-tenant__name">Naseej PRO Services</span>
                  <span className="bento-tenant__sub mono">naseej.mandoob.app</span>
                </div>
                <span className="bento-tenant__pill mono">live</span>
              </div>
              <ul className="bento-tenant__list" role="list">
                <li>
                  <span className="bento-tenant__avatar" data-letter="A" />
                  Acme Business Setup
                </li>
                <li>
                  <span className="bento-tenant__avatar" data-letter="Q" />
                  Quay Corporate Services
                </li>
              </ul>
            </div>
          </li>

          {/* Tile E — Audit feed */}
          <li className="bento-tile bento-tile--audit reveal" aria-label="Audit feed demo">
            <div className="bento-tile__head">
              <span className="bento-tile__icon" aria-hidden="true">
                <History size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Audit trail</span>
            </div>
            <h3 className="bento-tile__title">Every action, attributed.</h3>
            <ol className="bento-audit" aria-hidden="true">
              <li>
                <span className="bento-audit__time mono">12:42</span>
                <span className="bento-audit__actor">
                  <Users size={11} strokeWidth={1.75} aria-hidden="true" /> sarah
                </span>
                <span className="bento-audit__verb mono">visa.stamp</span>
              </li>
              <li>
                <span className="bento-audit__time mono">11:55</span>
                <span className="bento-audit__actor">
                  <Users size={11} strokeWidth={1.75} aria-hidden="true" /> ahmed
                </span>
                <span className="bento-audit__verb mono">invoice.paid</span>
              </li>
              <li>
                <span className="bento-audit__time mono">09:00</span>
                <span className="bento-audit__actor">
                  <Users size={11} strokeWidth={1.75} aria-hidden="true" /> system
                </span>
                <span className="bento-audit__verb mono">renewal.alert</span>
              </li>
            </ol>
          </li>

          {/* Tile F — Payment */}
          <li className="bento-tile bento-tile--pay reveal" aria-label="Payment demo">
            <div className="bento-tile__head">
              <span className="bento-tile__icon" aria-hidden="true">
                <CreditCard size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Tap + Stripe</span>
            </div>
            <h3 className="bento-tile__title">Invoiced in AED. Paid online.</h3>
            <div className="bento-invoice" aria-hidden="true">
              <header>
                <span className="bento-invoice__id mono">INV-1042</span>
                <span className="bento-invoice__paid">
                  <CheckCircle2 size={12} strokeWidth={2} /> Paid
                </span>
              </header>
              <div className="bento-invoice__amount">
                <span className="bento-invoice__currency mono">AED</span>
                <span className="bento-invoice__value">8,450</span>
              </div>
              <footer className="mono">Tap · mada · Apple Pay</footer>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
