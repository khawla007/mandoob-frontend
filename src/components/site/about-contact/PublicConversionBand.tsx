import Link from 'next/link';

export type PublicActionHref =
  | '/estimate'
  | '/contact'
  | '/apply'
  | '/knowledge-base'
  | '/mainland'
  | '/free-zones'
  | '/offshore'
  | '/pro';

type ConversionLink = {
  label: string;
  href: PublicActionHref;
};

type PublicConversionBandProps = {
  headingId: string;
  title: string;
  description: string;
  primaryCta: ConversionLink;
  secondaryCta: ConversionLink;
};

export function PublicConversionBand({
  headingId,
  title,
  description,
  primaryCta,
  secondaryCta,
}: PublicConversionBandProps) {
  return (
    <section className="about-contact-conversion" aria-labelledby={headingId}>
      <div className="about-contact-conversion__skyline" aria-hidden="true" />
      <div className="about-contact-conversion__inner container">
        <div className="about-contact-conversion__copy">
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="about-contact-conversion__actions">
          <Link className="btn about-contact-conversion__primary" href={primaryCta.href}>
            {primaryCta.label}
          </Link>
          <Link className="btn about-contact-conversion__secondary" href={secondaryCta.href}>
            {secondaryCta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
