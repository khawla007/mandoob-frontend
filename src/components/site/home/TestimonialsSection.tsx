import { getLocale, getTranslations } from 'next-intl/server';

import { TestimonialsCarousel, type Testimonial } from './TestimonialsCarousel';

const CLIENTS = [
  { key: 'client1', image: '/customers/jonas-keller.svg' },
  { key: 'client2', image: '/customers/lina-chen.svg' },
  { key: 'client3', image: '/customers/omar-bensalem.svg' },
  { key: 'client4', image: '/customers/priya-ramesh.svg' },
  { key: 'client5', image: '/customers/jonas-keller.svg' },
  { key: 'client6', image: '/customers/lina-chen.svg' },
  { key: 'client7', image: '/customers/omar-bensalem.svg' },
  { key: 'client8', image: '/customers/priya-ramesh.svg' },
  { key: 'client9', image: '/customers/jonas-keller.svg' },
  { key: 'client10', image: '/customers/lina-chen.svg' },
] as const;

export async function TestimonialsSection() {
  const [t, locale] = await Promise.all([getTranslations('home.testimonials'), getLocale()]);
  const testimonials: Testimonial[] = CLIENTS.map(({ key, image }) => ({
    id: key,
    image,
    name: t(`${key}Name`),
    role: t(`${key}Role`),
    quote: t(`${key}Quote`),
  }));
  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <section className="home-testimonials-section" aria-labelledby="testimonials-h">
      <div className="container">
        <h2 id="testimonials-h" className="home-section-title">
          {t('title')}
        </h2>
        <TestimonialsCarousel
          testimonials={testimonials}
          carouselLabel={t('carouselLabel')}
          ratingLabel={t('fiveStars')}
          direction={direction}
        />
      </div>
    </section>
  );
}
