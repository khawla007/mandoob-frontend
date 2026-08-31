import { SplitImageContent } from '@/components/site/SplitImageContent';
import { getTranslations } from 'next-intl/server';

export async function WhyMandoobSection() {
  const t = await getTranslations('home.why');
  const items = [1, 2, 3, 4] as const;

  return (
    <section className="section" aria-labelledby="why-h">
      <div className="container">
        <SplitImageContent
          reverse
          media={
            <div className="home-workspace-preview" aria-label={t('visualTitle')}>
              <span className="eyebrow">{t('visualEyebrow')}</span>
              <strong>{t('visualTitle')}</strong>
              <p>{t('visualText')}</p>
              <div className="home-workspace-preview__rail" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          }
        >
          <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
          <h2 id="why-h" className="h2">
            {t('title')}
          </h2>
          <ul className="split-showcase__list">
            {items.map((item) => (
              <li key={item}>
                <h3>{t(`item${item}Title`)}</h3>
                <p>{t(`item${item}Text`)}</p>
              </li>
            ))}
          </ul>
        </SplitImageContent>
      </div>
    </section>
  );
}
