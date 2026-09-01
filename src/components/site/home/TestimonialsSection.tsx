import { getLocale, getTranslations } from 'next-intl/server';

import { TestimonialsCarousel, type WorkflowCapability } from './TestimonialsCarousel';

const WORKFLOW_ITEMS = [
  { key: 'item1', marker: '01' },
  { key: 'item2', marker: '02' },
  { key: 'item3', marker: '03' },
  { key: 'item4', marker: '04' },
  { key: 'item5', marker: '05' },
  { key: 'item6', marker: '06' },
  { key: 'item7', marker: '07' },
  { key: 'item8', marker: '08' },
  { key: 'item9', marker: '09' },
  { key: 'item10', marker: '10' },
] as const;

export async function TestimonialsSection() {
  const [t, locale] = await Promise.all([getTranslations('home.testimonials'), getLocale()]);
  const items: WorkflowCapability[] = WORKFLOW_ITEMS.map(({ key, marker }) => ({
    id: key,
    marker,
    title: t(`${key}Title`),
    context: t(`${key}Context`),
    text: t(`${key}Text`),
  }));
  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <section className="home-testimonials-section" aria-labelledby="testimonials-h">
      <div className="container">
        <header className="home-testimonials-head">
          <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
          <h2 id="testimonials-h" className="home-section-title">
            {t('title')}
          </h2>
        </header>
        <TestimonialsCarousel
          items={items}
          carouselLabel={t('carouselLabel')}
          direction={direction}
        />
      </div>
    </section>
  );
}
