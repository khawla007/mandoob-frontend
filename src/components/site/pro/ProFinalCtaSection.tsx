import Link from 'next/link';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';

export function ProFinalCtaSection() {
  const { finalCta } = PUBLIC_PRO_CONTENT;

  return (
    <section className="about-contact-conversion" aria-labelledby="pro-final-cta-title">
      <div className="about-contact-conversion__skyline" aria-hidden="true" />
      <div className="about-contact-conversion__inner container">
        <div className="about-contact-conversion__copy">
          <h2 id="pro-final-cta-title">{finalCta.title.text}</h2>
          <p>{finalCta.description.text}</p>
        </div>
        <div className="about-contact-conversion__actions">
          <Link className="btn about-contact-conversion__primary" href={finalCta.links[0].href}>
            {finalCta.links[0].label.text}
          </Link>
          <Link className="btn about-contact-conversion__secondary" href={finalCta.links[1].href}>
            {finalCta.links[1].label.text}
          </Link>
        </div>
      </div>
    </section>
  );
}
