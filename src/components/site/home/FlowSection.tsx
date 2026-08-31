import { ClipboardList, FileText, Rocket, Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const STEPS = [
  ['step1', Search],
  ['step2', ClipboardList],
  ['step3', FileText],
  ['step4', Rocket],
] as const;

export async function FlowSection() {
  const t = await getTranslations('home.flow');

  return (
    <section id="flow" className="home-flow-section" aria-labelledby="flow-h">
      <div className="container">
        <header className="home-centered-head reveal">
          <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
          <h2 id="flow-h" className="home-section-title">
            {t('title')}
          </h2>
        </header>
        <ol className="home-flow-row">
          {STEPS.map(([key, Icon], index) => (
            <li key={key}>
              <span className="home-flow-row__number mono">0{index + 1}</span>
              <Icon aria-hidden="true" />
              <div>
                <h3>{t(`${key}Title`)}</h3>
                <p>{t(`${key}Text`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
