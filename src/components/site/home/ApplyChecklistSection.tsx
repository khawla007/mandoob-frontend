import { CircleCheck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const REQUIREMENTS = ['passport', 'personal', 'activity', 'ownership', 'visa', 'office'] as const;

export async function ApplyChecklistSection() {
  const t = await getTranslations('home.applyChecklist');

  return (
    <section className="home-apply-section" aria-labelledby="home-apply-h">
      <div className="container">
        <div className="home-apply-card" data-reveal-cards>
          <div className="home-apply-card__copy reveal home-reveal--from-start">
            <h2 id="home-apply-h" className="home-section-title">
              {t('title')}
            </h2>
            <p>{t('lede')}</p>
            <ul className="home-apply-card__list" role="list">
              {REQUIREMENTS.map((key, index) => (
                <li key={key} data-emphasis={index < 3 ? 'solid' : 'outline'}>
                  <CircleCheck aria-hidden="true" />
                  {t(key)}
                </li>
              ))}
            </ul>
            <Link className="btn btn--accent" href="/apply">
              {t('cta')} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="home-apply-card__media reveal home-reveal--from-end">
            <Image
              src="/home-reference/uae-document-checklist.webp"
              alt={t('imageAlt')}
              fill
              sizes="(max-width: 767px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
