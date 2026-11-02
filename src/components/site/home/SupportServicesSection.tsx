import { Briefcase, Building2, CalendarClock, IdCard, Landmark, ReceiptText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';

const SERVICES = [
  ['companySetup', Building2],
  ['proServices', Briefcase],
  ['bank', Landmark],
  ['vat', ReceiptText],
  ['visa', IdCard],
  ['renewal', CalendarClock],
] as const;

export async function SupportServicesSection() {
  const t = await getTranslations('home.services');

  return (
    <section className="home-services-section" aria-labelledby="home-services-h">
      <div className="container">
        <h2 id="home-services-h" className="home-section-title">
          {t('supportHeading')}
        </h2>
        <ul className="home-services-grid" role="list" data-reveal-cards>
          {SERVICES.map(([key, Icon], index) => (
            <li className="reveal" key={key} style={{ '--reveal-i': index } as CSSProperties}>
              <span className={`home-icon-medallion home-icon-medallion--${index + 1}`}>
                <Icon aria-hidden="true" />
              </span>
              <h3>{t(`${key}Title`)}</h3>
              <p>{t(`${key}Text`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
