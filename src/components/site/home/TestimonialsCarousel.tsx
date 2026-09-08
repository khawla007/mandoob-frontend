'use client';

import { useEffect, useId, useState } from 'react';
import type { Swiper as SwiperInstance } from 'swiper';
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
  previousLabel: string;
  nextLabel: string;
  positionLabel: string;
  direction: 'ltr' | 'rtl';
}

export function TestimonialsCarousel({
  items,
  carouselLabel,
  previousLabel,
  nextLabel,
  positionLabel,
  direction,
}: TestimonialsCarouselProps) {
  const carouselId = useId();
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
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

  return (
    <div
      className="home-testimonials-carousel testimonial-slider"
      role="region"
      aria-roledescription="carousel"
      aria-label={carouselLabel}
      dir={direction}
    >
      <Swiper
        id={carouselId}
        speed={reducedMotion ? 0 : 350}
        spaceBetween={20}
        rewind={items.length > 4}
        onSwiper={setSwiper}
        onSlideChange={(instance) => setActiveIndex(instance.realIndex)}
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
      <div className="home-testimonials-controls">
        <button
          className="btn btn--outline btn--sm"
          type="button"
          aria-label={previousLabel}
          aria-controls={carouselId}
          onClick={() => swiper?.slidePrev()}
        >
          <span aria-hidden="true">←</span>
        </button>
        <p aria-live="polite" aria-atomic="true">
          {positionLabel}: {activeIndex + 1} of {items.length}
        </p>
        <button
          className="btn btn--outline btn--sm"
          type="button"
          aria-label={nextLabel}
          aria-controls={carouselId}
          onClick={() => swiper?.slideNext()}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
