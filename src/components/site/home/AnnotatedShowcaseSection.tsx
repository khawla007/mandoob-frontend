import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const CHIPS = [
  { id: 1, targetX: 32, targetY: 58, chipX: 8, chipY: 36 },
  { id: 2, targetX: 28, targetY: 14, chipX: 12, chipY: 4 },
  { id: 3, targetX: 72, targetY: 22, chipX: 88, chipY: 8 },
  { id: 4, targetX: 70, targetY: 78, chipX: 86, chipY: 86 },
] as const;

export async function AnnotatedShowcaseSection() {
  const t = await getTranslations('home.preview');

  return (
    <section id="annotated-showcase" className="section" aria-labelledby="annotated-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
          <h2 id="annotated-h" className="h2">
            {t('title')}
          </h2>
        </header>
      </div>
      <div className="container">
        <div className="annotated-showcase reveal">
          <svg
            className="annotated-showcase__lines"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {CHIPS.map((chip) => (
              <line
                key={chip.id}
                x1={chip.chipX}
                y1={chip.chipY}
                x2={chip.targetX}
                y2={chip.targetY}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {CHIPS.map((chip) => (
            <span
              key={chip.id}
              className="annotated-chip"
              style={{ insetInlineStart: `${chip.chipX}%`, top: `${chip.chipY}%` }}
              role="presentation"
            >
              <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
              {t(`chip${chip.id}`)}
            </span>
          ))}

          <div className="annotated-mock" aria-label={t('ariaLabel')}>
            <header className="annotated-mock__head">
              <div>
                <span className="eyebrow">{t('illustrative')}</span>
                <h3 className="annotated-mock__title">
                  {t('estimateName')} <span className="mono">· {t('estimateContext')}</span>
                </h3>
              </div>
            </header>
            <table className="annotated-mock__table">
              <caption className="visually-hidden">{t('tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('item')}</th>
                  <th scope="col" className="mono">
                    {t('amount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(['licence', 'visa', 'office', 'services'] as const).map((item) => (
                  <tr key={item}>
                    <td>{t(item)}</td>
                    <td className="mono">{t(`${item}Amount`)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t('total')}</th>
                  <td className="mono">{t('totalAmount')}</td>
                </tr>
              </tfoot>
            </table>
            <footer className="annotated-mock__foot">
              <span className="annotated-mock__note">{t('note')}</span>
              <Link className="annotated-mock__cta" href="/apply">
                {t('cta')} <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
              </Link>
            </footer>
          </div>
          <ul className="annotated-mobile-list" aria-label={t('listLabel')}>
            {CHIPS.map((chip) => (
              <li key={chip.id}>{t(`chip${chip.id}`)}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
