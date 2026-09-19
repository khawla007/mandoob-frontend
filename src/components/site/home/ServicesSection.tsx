import { Building2, Factory, Globe2 } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';

const PATHS = [
  { key: 'mainland', href: '/mainland', cta: 'exploreMainland', Icon: Building2 },
  { key: 'freeZone', href: '/free-zones', cta: 'exploreFreeZone', Icon: Factory },
  { key: 'offshore', href: '/offshore', cta: 'exploreOffshore', Icon: Globe2 },
] as const;

export async function ServicesSection() {
  const t = await getTranslations('home.services');
  const titleText = t('title');
  const titleWords = titleText.trim().split(/\s+/u);
  let characterIndex = 0;

  return (
    <section id="services" className="home-setup-section" aria-labelledby="services-h">
      <div className="container">
        <header className="home-centered-head" data-reveal-cards>
          <span className="eyebrow eyebrow--accent reveal">{t('eyebrow')}</span>
          <h2
            id="services-h"
            className="home-section-title home-services-title--blur-reveal reveal"
            aria-label={titleText}
          >
            <span className="home-services-title__visual" aria-hidden="true">
              {titleWords.map((word, wordIndex) => (
                <span key={`${word}-${wordIndex}`}>
                  {wordIndex > 0 ? ' ' : null}
                  <span className="home-services-title__word">
                    {Array.from(word).map((character) => {
                      const index = characterIndex++;

                      return (
                        <span
                          className="home-services-title__char"
                          key={`${character}-${index}`}
                          style={{ '--home-services-char-index': index } as CSSProperties}
                        >
                          {character}
                        </span>
                      );
                    })}
                  </span>
                </span>
              ))}
            </span>
          </h2>
          <p className="reveal">{t('lede')}</p>
        </header>

        <div className="home-setup-grid cards-stagger" data-reveal-cards>
          {PATHS.map(({ key, href, cta, Icon }, index) => (
            <article className={`home-setup-card home-setup-card--${index + 1} reveal`} key={key}>
              <span className="home-icon-medallion">
                <Icon aria-hidden="true" />
              </span>
              <div>
                <h3>{t(`${key}Title`)}</h3>
                <p>{t(`${key}Summary`)}</p>
                <ul role="list">
                  <li>{t(`${key}Ideal`)}</li>
                  <li>{t(`${key}Market`)}</li>
                  <li>{t(`${key}Office`)}</li>
                </ul>
                <Link className="home-text-link" href={href}>
                  {t(cta)} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
