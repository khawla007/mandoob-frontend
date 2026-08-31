import { getTranslations } from 'next-intl/server';

export async function TrustBandSection() {
  const t = await getTranslations('home.trust');

  return (
    <section className="trust-band" aria-labelledby="trust-h">
      <h2 id="trust-h" className="visually-hidden">
        {t('heading')}
      </h2>
      <div className="logo-band">
        <ul className="logo-track logo-track--orientation" role="list">
          {[1, 2, 3, 4].map((item) => (
            <li key={item}>{t(`item${item}`)}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
