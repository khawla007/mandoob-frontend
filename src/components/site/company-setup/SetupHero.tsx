import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

type SetupHeroProps = {
  headingId: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  currentLabel: string;
  imageSrc: string;
  imageAlt: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  checklist?: ReactNode;
};

export function SetupHero({
  headingId,
  eyebrow,
  title,
  description,
  currentLabel,
  imageSrc,
  imageAlt,
  primaryCta,
  secondaryCta,
  checklist,
}: SetupHeroProps) {
  return (
    <div className="container setup-hero__frame">
      <nav className="setup-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/#services">Company setup</Link>
          </li>
          <li aria-current="page">{currentLabel}</li>
        </ol>
      </nav>
      <div className="setup-hero__grid">
        <div className="setup-hero__copy">
          <span className="eyebrow eyebrow--accent">{eyebrow}</span>
          <h1 id={headingId} className="setup-hero__title">
            {title}
          </h1>
          <p>{description}</p>
          <div className="cta-row">
            <Link className="btn btn--accent btn--lg" href={primaryCta.href}>
              {primaryCta.label}
            </Link>
            <Link className="btn btn--outline btn--lg" href={secondaryCta.href}>
              {secondaryCta.label}
            </Link>
          </div>
        </div>
        <div className="setup-hero__visual">
          <Image src={imageSrc} alt={imageAlt} fill priority sizes="(min-width: 1024px) 56vw, 100vw" />
          {checklist ? <div className="setup-hero__checklist">{checklist}</div> : null}
        </div>
      </div>
    </div>
  );
}
