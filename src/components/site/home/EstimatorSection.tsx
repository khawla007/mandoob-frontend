import Link from 'next/link';

import { EstimatorPreview } from '@/components/site/EstimatorPreview';

export function EstimatorSection() {
  return (
    <section id="estimator" className="section" aria-labelledby="est-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow">02 · Cost estimator</span>
          <h2 id="est-h" className="h2">
            Know the full cost before you commit.
          </h2>
        </header>
        <div className="cell-row cell-row--est" data-reveal-cards>
          <EstimatorPreview />
          <div className="cell cell--estside reveal">
            <h3>No surprise fees. Ever.</h3>
            <p>
              Every government fee, free zone surcharge, MOHRE, GDRFA, ICP, and PRO line: itemized
              before you commit. The quote saves to your dashboard as a versioned PDF.
            </p>
            <Link className="cell__link" href="/estimate">
              Run a live estimate <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
