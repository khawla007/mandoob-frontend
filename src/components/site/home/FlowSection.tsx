import { SplitImageContent } from '@/components/site/SplitImageContent';
import { getTranslations } from 'next-intl/server';

export async function FlowSection() {
  const t = await getTranslations('home.flow');
  const steps = [1, 2, 3, 4] as const;

  return (
    <section id="flow" className="section" aria-labelledby="flow-h">
      <div className="container">
        <SplitImageContent
          media={
            <div className="home-journey-visual" aria-label={t('visualLabel')}>
              {[1, 2, 3, 4].map((step) => (
                <div className="home-journey-visual__step" key={step}>
                  <span className="mono" aria-hidden="true">
                    0{step}
                  </span>
                  <strong>{t(`visualStep${step}`)}</strong>
                </div>
              ))}
            </div>
          }
        >
          <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
          <h2 id="flow-h" className="h2">
            {t('title')}
          </h2>
          <ol className="split-showcase__list split-showcase__list--steps">
            {steps.map((step) => (
              <li key={step}>
                <span className="flow__num mono" aria-hidden="true">
                  0{step}
                </span>
                <h3>{t(`step${step}Title`)}</h3>
                <p>{t(`step${step}Text`)}</p>
              </li>
            ))}
          </ol>
        </SplitImageContent>
      </div>
    </section>
  );
}
