import { BadgeCheck, CalendarClock, FileSearch, UserRoundCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const ITEMS = [BadgeCheck, FileSearch, UserRoundCheck, CalendarClock] as const;

export async function TrustBandSection() {
  const t = await getTranslations('home.trust');

  return (
    <section className="trust-band" aria-labelledby="trust-h">
      <h2 id="trust-h" className="visually-hidden">
        {t('heading')}
      </h2>
      <div className="container">
        <ul className="home-trust-grid" role="list">
          {ITEMS.map((Icon, index) => (
            <li key={index}>
              <span className="home-trust-grid__icon">
                <Icon aria-hidden="true" />
              </span>
              <span className="home-trust-grid__copy">
                <strong>{t(`item${index + 1}Title`)}</strong>
                <span>{t(`item${index + 1}Text`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
