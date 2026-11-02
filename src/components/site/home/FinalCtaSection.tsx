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
        params={{ sphereRadius: 0.13, deformationStrength: 32 }}
      />
      <div className="cta-section__inner container" data-reveal-cards>
        <span className="eyebrow eyebrow--accent reveal">{t('eyebrow')}</span>
        <h2 id="cta-h" className="display display--cta reveal">
          {t('title')}
        </h2>
        <div className="reveal">
          <Link className="btn btn--accent btn--lg" href="/estimate" id="cta-final">
            {t('estimateCta')}
          </Link>
        </div>
        <p className="micro mono reveal">{t('micro')}</p>
        <div className="cta-divider reveal" aria-hidden="true" />
        <p className="cta-secondary reveal">
          {t('proPrompt')}{' '}
          <Link className="cell__link" href="/pro">
            {t('proCta')} <span aria-hidden="true">↗</span>
          </Link>
        </p>
      </div>
    </section>
  );
}
