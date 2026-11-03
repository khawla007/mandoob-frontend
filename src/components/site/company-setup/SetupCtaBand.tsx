import Image from 'next/image';
import Link from 'next/link';

/**
 * Closing "Ready to …" band shared by the company-setup pages (Mainland,
 * Offshore). Dark rounded card with the skyline image, from the design HTML
 * `ctaSection`. Renders its own `#setup-conversion` section.
 */
export function SetupCtaBand({
  headingId,
  title,
  description,
  estimateHref,
}: {
  headingId: string;
  title: string;
  description: string;
  estimateHref: string;
}) {
  return (
    <section id="setup-conversion" className="bizreg-cta-shell" aria-labelledby={headingId}>
      <div className="container">
        <div className="bizreg-cta">
          <div className="bizreg-cta__media" aria-hidden="true">
            <Image src="/hero/skyline.webp" alt="" fill sizes="(min-width: 900px) 50vw, 100vw" />
          </div>
          <div className="bizreg-cta__copy">
            <h2 id={headingId}>{title}</h2>
            <p>{description}</p>
          </div>
          <div className="cta-row">
            <Link className="btn btn--light btn--lg" href={estimateHref}>
              Calculate My Setup Cost
            </Link>
            <Link className="btn btn--light btn--lg" href="/apply">
              Start Registration
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
