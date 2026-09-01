'use client';

import { useEffect, useState } from 'react';
import { Autoplay } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

import 'swiper/css';

export interface WorkflowCapability {
  id: string;
  marker: string;
  title: string;
  context: string;
  text: string;
}

interface TestimonialsCarouselProps {
  items: WorkflowCapability[];
  carouselLabel: string;
  direction: 'ltr' | 'rtl';
}

export function TestimonialsCarousel({
  items,
  carouselLabel,
  direction,
}: TestimonialsCarouselProps) {
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const autoplayConfig = reducedMotion
    ? false
    : {
        delay: 0,
        disableOnInteraction: true,
        pauseOnMouseEnter: true,
      };

  return (
    <div
      className="home-testimonials-carousel testimonial-slider"
      role="region"
      aria-roledescription="carousel"
      aria-label={carouselLabel}
      dir={direction}
    >
      <Swiper
        modules={[Autoplay]}
        autoplay={autoplayConfig}
        speed={reducedMotion ? 0 : 8000}
        spaceBetween={20}
        loop={items.length > 4}
        breakpoints={{
          450: { slidesPerView: 1, spaceBetween: 10 },
          640: { slidesPerView: 2, spaceBetween: 15 },
          768: { slidesPerView: 3, spaceBetween: 15 },
          1024: { slidesPerView: 4, spaceBetween: 20 },
        }}
      >
        {items.map((item) => (
          <SwiperSlide key={item.id}>
            <article className="home-testimonial-card" dir={direction}>
              <div className="home-testimonial-card__head">
                <span className="home-testimonial-card__marker" aria-hidden="true">
                  {item.marker}
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.context}</p>
                </div>
              </div>
              <p className="home-testimonial-card__text">{item.text}</p>
            </article>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
