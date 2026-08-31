import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function HeroSection() {
  const t = await getTranslations('home.hero');

  return (
    <>
      <section className="hero" aria-labelledby="hero-h">
        <div className="hero__overlay" aria-hidden="true" />
        <div className="container">
          <span className="eyebrow reveal reveal--mask">
            <span className="rise">
              <span className="rise__i">{t('eyebrow')}</span>
            </span>
          </span>
          <h1 id="hero-h" className="display reveal reveal--mask">
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '120ms' } as React.CSSProperties}>
                {t('set')}
              </span>
            </span>{' '}
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '200ms' } as React.CSSProperties}>
                {t('up')}
              </span>
            </span>{' '}
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '280ms' } as React.CSSProperties}>
                {t('stay')}
              </span>
            </span>{' '}
            <span className="rise">
              <span
                className="rise__i u-accent"
                style={{ '--rise-delay': '360ms' } as React.CSSProperties}
              >
                {t('compliant')}
              </span>
            </span>{' '}
            <span className="rise">
              <span className="rise__i" style={{ '--rise-delay': '440ms' } as React.CSSProperties}>
                {t('operate')}
              </span>
            </span>
          </h1>
          <p className="lede reveal reveal--mask">
            <span className="rise rise--block">
              <span className="rise__i" style={{ '--rise-delay': '520ms' } as React.CSSProperties}>
                {t('lede')}
              </span>
            </span>
          </p>
          <div className="cta-row reveal">
            <Link className="btn btn--accent" href="/estimate">
              {t('estimateCta')}
            </Link>
            <Link className="btn btn--outline" href="/apply">
              {t('applyCta')}
            </Link>
          </div>
        </div>
      </section>

      <section className="stats-band" aria-label={t('orientationLabel')}>
        <div className="container">
          <dl className="hero__spec">
            <div className="hero__stat reveal">
              <dt className="hero__statL">{t('orientation1Label')}</dt>
              <dd className="mono hero__statV">{t('orientation1Value')}</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">{t('orientation2Label')}</dt>
              <dd className="mono hero__statV">{t('orientation2Value')}</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">{t('orientation3Label')}</dt>
              <dd className="mono hero__statV u-accent">{t('orientation3Value')}</dd>
            </div>
            <div className="hero__stat reveal">
              <dt className="hero__statL">{t('orientation4Label')}</dt>
              <dd className="mono hero__statV">{t('orientation4Value')}</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
