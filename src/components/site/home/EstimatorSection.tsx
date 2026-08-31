import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { EstimatorPreview } from '@/components/site/EstimatorPreview';

export async function EstimatorSection() {
  const t = await getTranslations('home.estimator');

  return (
    <section id="estimator" className="home-estimator-section" aria-labelledby="est-h">
      <div className="container">
        <div className="home-estimator-band reveal">
          <div className="home-estimator-band__copy">
            <span className="eyebrow">{t('eyebrow')}</span>
            <h2 id="est-h">{t('title')}</h2>
            <p>{t('sideText')}</p>
            <p className="home-disclaimer">{t('disclaimer')}</p>
            <Link className="btn btn--accent" href="/estimate">
              {t('cta')} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="home-estimator-preview">
            <p className="home-illustrative-label mono">{t('previewLabel')}</p>
            <EstimatorPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
