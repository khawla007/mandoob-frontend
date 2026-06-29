import { ArrowRight, Sparkles } from 'lucide-react';

const CHIPS = [
  {
    id: 'breakdown',
    label: 'Govt fees + service, itemized',
    targetX: 32,
    targetY: 58,
    chipX: 2,
    chipY: 36,
  },
  {
    id: 'zones',
    label: '45+ Free Zones compared live',
    targetX: 28,
    targetY: 14,
    chipX: 4,
    chipY: 2,
  },
  {
    id: 'savings',
    label: 'Avg. AED 2,400 saved vs typical PRO quote',
    targetX: 72,
    targetY: 22,
    chipX: 94,
    chipY: 6,
  },
  {
    id: 'locked',
    label: 'Locked-in pricing — zero upsells',
    targetX: 70,
    targetY: 78,
    chipX: 92,
    chipY: 86,
  },
] as const;

export function AnnotatedShowcaseSection() {
  return (
    <section
      id="annotated-showcase"
      className="section"
      aria-labelledby="annotated-h"
    >
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow eyebrow--accent">05 · Inside an estimate</span>
          <h2 id="annotated-h" className="h2">
            Anatomy of an itemized estimate.
          </h2>
        </header>
      </div>

      <div className="container">
        <div className="annotated-showcase reveal">
          {/* dashed SVG connector lines — desktop only */}
          <svg
            className="annotated-showcase__lines"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {CHIPS.map((c) => (
              <line
                key={c.id}
                x1={c.chipX}
                y1={c.chipY}
                x2={c.targetX}
                y2={c.targetY}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* floating annotation chips */}
          {CHIPS.map((c) => (
            <span
              key={c.id}
              className="annotated-chip"
              style={{ left: `${c.chipX}%`, top: `${c.chipY}%` }}
              role="presentation"
            >
              <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
              {c.label}
            </span>
          ))}

          {/* product mock — cost estimator result */}
          <div className="annotated-mock" aria-label="Cost estimator result preview">
            <header className="annotated-mock__head">
              <div>
                <span className="eyebrow">Estimate · DMCC</span>
                <h3 className="annotated-mock__title">
                  Trading FZ-LLC <span className="mono">· 2 visa quota</span>
                </h3>
              </div>
              <span className="annotated-mock__save mono">save AED 2,400</span>
            </header>

            <table className="annotated-mock__table">
              <caption className="visually-hidden">
                Sample cost breakdown for a DMCC Trading FZ-LLC with 2 visa quota.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className="mono">
                    AED
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>License fee</td>
                  <td className="mono">12,500</td>
                </tr>
                <tr>
                  <td>Visa quota (2)</td>
                  <td className="mono">6,800</td>
                </tr>
                <tr>
                  <td>Establishment card</td>
                  <td className="mono">1,200</td>
                </tr>
                <tr>
                  <td>Office package</td>
                  <td className="mono">8,000</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total · year 1</th>
                  <td className="mono">28,500</td>
                </tr>
              </tfoot>
            </table>

            <footer className="annotated-mock__foot">
              <span className="annotated-mock__note">
                Includes all government fees. No mark-ups.
              </span>
              <span className="annotated-mock__cta">
                Start application
                <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
              </span>
            </footer>
          </div>

          {/* mobile fallback list — chips collapse here under <=640px */}
          <ul className="annotated-mobile-list" aria-label="What this estimate includes">
            {CHIPS.map((c) => (
              <li key={c.id}>{c.label}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
