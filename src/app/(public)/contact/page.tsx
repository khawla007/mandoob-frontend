import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function ContactPage() {
  const t = await getTranslations('contact');
  return (
    <>
      {/* ============ INTRO ============ */}
      <section className="section" aria-labelledby="contact-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">{t('eyebrow')}</span>
            <h1 id="contact-h" className="h2">
              {t('title')}
            </h1>
            <p className="lede">{t('lede')}</p>
          </header>
        </div>

        <div className="container">
          <div className="cell-row cell-row--est">
            {/* contact form (static — submission not yet wired) */}
            <div className="cell">
              <form
                className="pform"
                aria-describedby="contact-note"
                // Static UI only: no backend wired yet.
              >
                <div className="pform__field">
                  <label className="pform__label" htmlFor="cf-name">
                    {t('nameLabel')}
                  </label>
                  <input
                    id="cf-name"
                    name="name"
                    type="text"
                    placeholder={t('namePlaceholder')}
                    disabled
                  />
                </div>
                <div className="pform__field">
                  <label className="pform__label" htmlFor="cf-email">
                    {t('emailLabel')}
                  </label>
                  <input
                    id="cf-email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    disabled
                  />
                </div>
                <div className="pform__field">
                  <label className="pform__label" htmlFor="cf-message">
                    {t('messageLabel')}
                  </label>
                  <textarea
                    id="cf-message"
                    name="message"
                    placeholder={t('messagePlaceholder')}
                    disabled
                  />
                </div>
                <button type="button" className="btn btn--accent" disabled aria-disabled="true">
                  {t('submit')}
                </button>
                <p id="contact-note" className="micro">
                  {t('comingSoonNote')}
                </p>
              </form>
            </div>

            {/* contact details */}
            <div className="cell cell--estside">
              <h3>{t('officeCity')}</h3>
              <p>{t('officeCountry')}</p>
              <p className="mono">
                <a className="cell__link" href="mailto:hello@mandoob.ae">
                  hello@mandoob.ae <span aria-hidden="true">↗</span>
                </a>
              </p>
              <p className="micro mono">{t('officeHours')}</p>
              <p className="cta-secondary">
                {t('proCtaPrefix')}{' '}
                <Link className="cell__link" href="/register/pro">
                  {t('proCtaLink')} <span aria-hidden="true">↗</span>
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
