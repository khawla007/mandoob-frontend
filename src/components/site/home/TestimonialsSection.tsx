import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

const CLIENTS = [
  { key: 'client1', image: '/customers/jonas-keller.svg' },
  { key: 'client2', image: '/customers/lina-chen.svg' },
  { key: 'client3', image: '/customers/omar-bensalem.svg' },
] as const;

export async function TestimonialsSection() {
  const t = await getTranslations('home.testimonials');

  return (
    <section className="home-testimonials-section" aria-labelledby="testimonials-h">
      <div className="container">
        <h2 id="testimonials-h" className="home-section-title">
          {t('title')}
        </h2>
        <div className="home-testimonials-shell">
          <span className="home-testimonials-arrow" aria-hidden="true">
            ‹
          </span>
          <div className="home-testimonials-grid">
            {CLIENTS.map(({ key, image }) => (
              <article className="home-testimonial-card" key={key}>
                <div className="home-testimonial-card__head">
                  <Image src={image} alt="" width={52} height={52} />
                  <div>
                    <h3>{t(`${key}Name`)}</h3>
                    <p>{t(`${key}Role`)}</p>
                    <span className="home-testimonial-card__stars" aria-label={t('fiveStars')}>
                      ★★★★★
                    </span>
                  </div>
                </div>
                <blockquote>{t(`${key}Quote`)}</blockquote>
              </article>
            ))}
          </div>
          <span className="home-testimonials-arrow" aria-hidden="true">
            ›
          </span>
        </div>
      </div>
    </section>
  );
}
