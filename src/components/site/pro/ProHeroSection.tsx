import Link from 'next/link';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';

export function ProHeroSection() {
  const hero = PUBLIC_PRO_CONTENT.hero;
  const policy = PUBLIC_PRO_CONTENT.policy;

  return (
    <>
      <section className="hero hero--pro" aria-labelledby="pro-hero-h">
        <div className="hero__overlay" aria-hidden="true" />
        <div className="container">
          <nav className="about-contact-breadcrumb pro-hero__breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li aria-current="page">{hero.breadcrumb.text}</li>
            </ol>
          </nav>
          <span className="eyebrow reveal reveal--mask">
            <span className="rise">
              <span className="rise__i">{hero.eyebrow.text}</span>
            </span>
          </span>
          <h1 id="pro-hero-h" className="display reveal reveal--mask">
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '120ms' } as React.CSSProperties}>
                {hero.title.text}
              </span>
            </span>{' '}
            <span className="rise">
              <span
                className="rise__i u-accent"
                style={{ '--rise-delay': '240ms' } as React.CSSProperties}
              >
                {hero.accent.text}
              </span>
            </span>
          </h1>
          <p className="lede reveal reveal--mask">
            <span className="rise rise--block">
              <span className="rise__i" style={{ '--rise-delay': '520ms' } as React.CSSProperties}>
                {hero.description.text}
              </span>
            </span>
          </p>
          <div className="cta-row reveal">
            {hero.links.map((link, index) => (
              <Link
                className={index === 0 ? 'btn btn--accent' : 'btn btn--outline'}
                href={link.href}
                key={link.href}
              >
                {link.label.text}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="stats-band" aria-label={policy.label.text}>
        <div className="container">
          <dl className="hero__spec">
            {policy.items.map((item) => (
              <div className="hero__stat reveal" key={item.term.text}>
                <dt className="hero__statL">{item.term.text}</dt>
                <dd className="mono hero__statV">{item.detail.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
