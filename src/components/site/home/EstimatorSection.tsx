import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { EstimatorPreview } from '@/components/site/EstimatorPreview';

export async function EstimatorSection() {
  const t = await getTranslations('home.estimator');

  return (
    <section id="estimator" className="section" aria-labelledby="est-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
          <h2 id="est-h" className="h2">
            {t('title')}
          </h2>
        </header>
        <div className="cell-row cell-row--est" data-reveal-cards>
          <div className="home-estimator-preview">
            <p className="home-illustrative-label mono">{t('previewLabel')}</p>
            <EstimatorPreview />
          </div>
          <div className="cell cell--estside reveal">
            <h3>{t('sideTitle')}</h3>
            <p>{t('sideText')}</p>
            <p className="home-disclaimer">{t('disclaimer')}</p>
            <Link className="cell__link" href="/estimate">
              {t('cta')} <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
