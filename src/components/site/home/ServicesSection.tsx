import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const PATHS = [
  { key: 'mainland', query: 'mainland', marker: 'M·01', cta: 'exploreMainland' },
  { key: 'freeZone', query: 'free-zone', marker: 'FZ·02', cta: 'exploreFreeZone' },
  { key: 'offshore', query: 'offshore', marker: 'OS·03', cta: 'exploreOffshore' },
] as const;
const SUPPORT = ['companySetup', 'proServices', 'bank', 'vat', 'visa', 'renewal'] as const;

export async function ServicesSection() {
  const t = await getTranslations('home.services');

  return (
    <section id="services" className="section" aria-labelledby="services-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
          <h2 id="services-h" className="h2">
            {t('title')}
          </h2>
          <p className="section__lede">{t('lede')}</p>
        </header>

        <div className="cell-row cell-row--joined cell-row--svc cards-stagger" data-reveal-cards>
          {PATHS.map((path) => (
            <article className="cell cell--svc reveal" key={path.key}>
              <span className="cell__mark cell__mark--num" aria-hidden="true">
                {path.marker}
              </span>
              <h3>{t(`${path.key}Title`)}</h3>
              <p>{t(`${path.key}Summary`)}</p>
              <Link className="cell__link" href={`/estimate?jurisdiction=${path.query}`}>
                {t(path.cta)} <span aria-hidden="true">↗</span>
              </Link>
            </article>
          ))}
        </div>

        <div
          className="cell compare reveal"
          tabIndex={0}
          role="region"
          aria-label={t('compareCaption')}
        >
          <table className="compare__table">
            <caption className="visually-hidden">{t('compareCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('compare')}</th>
                {PATHS.map((path) => (
                  <th scope="col" key={path.key}>
                    {t(`${path.key}Title`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['idealUse', 'marketAccess', 'ownership', 'office', 'visas'] as const).map(
                (row) => (
                  <tr key={row}>
                    <th scope="row">{t(row)}</th>
                    {PATHS.map((path) => (
                      <td key={path.key}>
                        {t(`${path.key}${row[0].toUpperCase()}${row.slice(1)}`)}
                      </td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        <div className="home-support">
          <h3 className="home-support__heading">{t('supportHeading')}</h3>
          <ul className="home-support-grid" role="list">
            {SUPPORT.map((service) => (
              <li className="cell" key={service}>
                <h4>{t(`${service}Title`)}</h4>
                <p>{t(`${service}Text`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
