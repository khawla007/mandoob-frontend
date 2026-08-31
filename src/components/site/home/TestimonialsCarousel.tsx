'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Autoplay } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

import 'swiper/css';

export interface Testimonial {
  id: string;
  image: string;
  name: string;
  role: string;
  quote: string;
}

interface TestimonialsCarouselProps {
  testimonials: Testimonial[];
  carouselLabel: string;
  ratingLabel: string;
  direction: 'ltr' | 'rtl';
}

export function TestimonialsCarousel({
  testimonials,
  carouselLabel,
  ratingLabel,
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
        loop={testimonials.length > 4}
        breakpoints={{
          450: { slidesPerView: 1, spaceBetween: 10 },
          640: { slidesPerView: 2, spaceBetween: 15 },
          768: { slidesPerView: 3, spaceBetween: 15 },
          1024: { slidesPerView: 4, spaceBetween: 20 },
        }}
      >
        {testimonials.map((testimonial) => (
          <SwiperSlide key={testimonial.id}>
            <article className="home-testimonial-card" dir={direction}>
              <div className="home-testimonial-card__head">
                <Image src={testimonial.image} alt="" width={52} height={52} />
                <div>
                  <h3>{testimonial.name}</h3>
                  <p>{testimonial.role}</p>
                  <span className="home-testimonial-card__stars" aria-label={ratingLabel}>
                    ★★★★★
                  </span>
                </div>
              </div>
              <blockquote>{testimonial.quote}</blockquote>
            </article>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
