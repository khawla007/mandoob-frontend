import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function EstimatorSection() {
  const t = await getTranslations('home.estimator');

  const rows = ['licence', 'registration', 'visa', 'office', 'services'] as const;

  return (
    <section id="estimator" className="home-estimator-section" aria-labelledby="est-h">
      <div className="container">
        <div className="home-estimator-band reveal">
          <div className="home-estimator-band__copy">
            <h2 id="est-h">{t('title')}</h2>
            <p>{t('sideText')}</p>
            <Link className="btn btn--accent" href="/estimate">
              {t('cta')} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="home-estimate-card">
            <p className="home-estimate-card__label">{t('breakdownTitle')}</p>
            <dl>
              {rows.map((row) => (
                <div key={row}>
                  <dt>{t(row)}</dt>
                  <dd className="mono">{t(`${row}Amount`)}</dd>
                </div>
              ))}
              <div className="home-estimate-card__total">
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
