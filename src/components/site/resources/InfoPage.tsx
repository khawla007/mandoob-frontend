import Link from 'next/link';
import type { ReactNode } from 'react';

import { PageScenicHero } from '../about-contact/PageScenicHero';

/**
 * Shared building blocks for the simple supporting pages from the updated
 * design HTML (PRO Services, Registration Process, Guides, Document
 * Requirements, FAQ). The hero reuses the About hero treatment so every inner
 * page shares the `--inner-hero-block` height.
 */

type InfoPageHeroProps = {
  headingId: string;
  eyebrow: string;
  title: string;
  description: string;
  currentLabel: string;
  imageSrc: `/${string}`;
  imageAlt: string;
};

export function InfoPageHero(props: InfoPageHeroProps) {
  return <PageScenicHero className="about-page__hero info-page__hero" {...props} />;
}

type InfoSectionProps = {
  headingId: string;
  eyebrow: string;
  title: string;
  lede?: string;
  tone?: 'plain' | 'soft';
  children: ReactNode;
};

export function InfoSection({
  headingId,
  eyebrow,
  title,
  lede,
  tone = 'plain',
  children,
}: InfoSectionProps) {
  return (
    <section
      className={
        tone === 'soft' ? 'info-page__section info-page__section--soft' : 'info-page__section'
      }
      aria-labelledby={headingId}
    >
      <div className="container">
        <header className="about-page__section-heading about-page__section-heading--centered">
          <span className="eyebrow eyebrow--accent">{eyebrow}</span>
          <h2 id={headingId}>{title}</h2>
          {lede ? <p>{lede}</p> : null}
        </header>
        {children}
      </div>
    </section>
  );
}

export type InfoCardItem = {
  icon: ReactNode;
  title: string;
  text: string;
  href?: string;
  cta?: string;
  list?: readonly string[];
};

export function InfoCardGrid({ items }: { items: readonly InfoCardItem[] }) {
  return (
    <ul className="info-page__grid" role="list">
      {items.map((item) => (
        <li className="info-page__card" key={item.title}>
          <span className="about-page__value-icon" aria-hidden="true">
            {item.icon}
          </span>
          <h3>{item.title}</h3>
          {item.text ? <p>{item.text}</p> : null}
          {item.list ? (
            <ul className="info-page__checklist" role="list">
              {item.list.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : null}
          {item.href && item.cta ? (
            <Link className="home-text-link" href={item.href}>
              {item.cta} <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
