import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CompactFeature, type CompactFeatureProps } from './CompactFeature';

export type PublicActionHref =
  | '/estimate'
  | '/contact'
  | '/apply'
  | '/knowledge-base'
  | '/mainland'
  | '/free-zones'
  | '/offshore';

type PublicLink = {
  label: string;
  href: PublicActionHref;
};

type ScenicHeroFeatures =
  | readonly [CompactFeatureProps, CompactFeatureProps, CompactFeatureProps]
  | readonly [CompactFeatureProps, CompactFeatureProps, CompactFeatureProps, CompactFeatureProps];

type PageScenicHeroProps = {
  className?: string;
  headingId: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  currentLabel: string;
  imageSrc: `/${string}`;
  imageAlt: string;
  primaryCta: PublicLink;
  secondaryCta: PublicLink;
  features?: ScenicHeroFeatures;
};

export function PageScenicHero({
  className,
  headingId,
  eyebrow,
  title,
  description,
  currentLabel,
  imageSrc,
  imageAlt,
  primaryCta,
  secondaryCta,
  features,
}: PageScenicHeroProps) {
  return (
    <section
      className={className ? `about-contact-hero ${className}` : 'about-contact-hero'}
      aria-labelledby={headingId}
    >
      <div className="about-contact-hero__frame container">
        <nav className="about-contact-breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li aria-current="page">{currentLabel}</li>
          </ol>
        </nav>
      </div>

      <div className="about-contact-hero__grid">
        <div className="about-contact-hero__copy">
          <span className="eyebrow eyebrow--accent">{eyebrow}</span>
          <h1 id={headingId} className="about-contact-hero__title">
            {title}
          </h1>
          <p className="about-contact-hero__description">{description}</p>
          <div className="about-contact-hero__actions">
            <Link className="btn btn--accent" href={primaryCta.href}>
              {primaryCta.label}
            </Link>
            <Link className="btn btn--outline" href={secondaryCta.href}>
              {secondaryCta.label}
            </Link>
          </div>
          {features?.length ? (
            <div className="about-contact-hero__features" data-feature-count={features.length}>
              {features.map((feature) => (
                <CompactFeature key={feature.title} {...feature} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="about-contact-hero__visual">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(min-width: 1440px) 43vw, (min-width: 1280px) 43vw, (min-width: 900px) 45vw, 100vw"
            preload={true}
          />
        </div>
      </div>
    </section>
  );
}
