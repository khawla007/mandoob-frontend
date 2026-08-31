'use client';

import { FabricBackground } from '@/components/FabricBackground';
import { useMouse } from '@/hooks/useMouse';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function FinalCtaSection() {
  const { pointer, onPointerMove, onPointerLeave } = useMouse();
  const t = useTranslations('home.finalCta');

  return (
    <section
      className="cta-section"
      aria-labelledby="cta-h"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <FabricBackground
        pointer={pointer}
        ambientMotion
        params={{ sphereRadius: 0.18, deformationStrength: 72 }}
      />
      <div className="cta-section__inner reveal container">
        <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
        <h2 id="cta-h" className="display display--cta">
          {t('title')}
        </h2>
        <Link className="btn btn--accent btn--lg" href="/estimate" id="cta-final">
          {t('estimateCta')}
        </Link>
        <p className="micro mono">{t('micro')}</p>
        <div className="cta-divider" aria-hidden="true" />
        <p className="cta-secondary">
          {t('proPrompt')}{' '}
          <Link className="cell__link" href="/pro">
            {t('proCta')} <span aria-hidden="true">↗</span>
          </Link>
        </p>
      </div>
    </section>
  );
}
