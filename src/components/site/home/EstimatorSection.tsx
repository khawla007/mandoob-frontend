import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';

export async function EstimatorSection() {
  const t = await getTranslations('home.estimator');

  const rows = ['licence', 'registration', 'visa', 'office', 'services'] as const;

  return (
    <section id="estimator" className="home-estimator-section" aria-labelledby="est-h">
      <div className="container">
        <div className="home-estimator-band" data-reveal-cards>
          <div className="home-estimator-band__copy reveal home-reveal--from-start">
            <span className="home-estimator-kicker eyebrow eyebrow--accent">{t('eyebrow')}</span>
            <h2 id="est-h">{t('title')}</h2>
            <p>{t('sideText')}</p>
            <Link className="btn btn--accent" href="/estimate">
              {t('cta')} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="home-estimate-card reveal home-reveal--from-end">
            <p className="home-estimate-card__label">{t('breakdownTitle')}</p>
            <dl>
              {rows.map((row, index) => (
                <div key={row} style={{ '--reveal-i': index } as CSSProperties}>
                  <dt>{t(row)}</dt>
                  <dd className="mono">{t(`${row}Amount`)}</dd>
                </div>
              ))}
              <div
                className="home-estimate-card__total"
                style={{ '--reveal-i': rows.length } as CSSProperties}
              >
                <dt>{t('total')}</dt>
                <dd className="mono">{t('totalAmount')}</dd>
              </div>
            </dl>
            <p className="home-estimate-card__note">{t('disclaimer')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
