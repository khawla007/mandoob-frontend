import { BellRing, FolderCheck, ListChecks, UserRoundCheck, Workflow } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';

const ITEMS = [ListChecks, UserRoundCheck, FolderCheck, BellRing, Workflow] as const;

export async function WhyMandoobSection() {
  const t = await getTranslations('home.why');

  return (
    <section className="home-why-section" aria-labelledby="why-h">
      <div className="container">
        <header className="home-centered-head reveal">
          <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
          <h2 id="why-h" className="home-section-title">
            {t('title')}
          </h2>
        </header>
        <ul className="home-why-row" role="list" data-reveal-cards>
          {ITEMS.map((Icon, index) => (
            <li className="reveal" key={index} style={{ '--reveal-i': index } as CSSProperties}>
              <span className="home-why-row__icon">
                <Icon aria-hidden="true" />
              </span>
              <h3>{t(`item${index + 1}Title`)}</h3>
              <p>{t(`item${index + 1}Text`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
