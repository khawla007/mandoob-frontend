'use client';

import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

// Placeholder testimonials from the approved homepage design. Replace with real,
// consented customer quotes before launch.
const ITEMS = ['item1', 'item2', 'item3'] as const;

export function TestimonialsSection() {
  const t = useTranslations('home.testimonials');
  const trackRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const updateEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const scrolled = Math.abs(track.scrollLeft);
    const max = track.scrollWidth - track.clientWidth;
    setEdges({ start: scrolled <= 2, end: scrolled >= max - 2 });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [updateEdges]);

  const scrollByCard = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector('li');
    const step = card ? card.getBoundingClientRect().width + 18 : track.clientWidth;
    const rtl = getComputedStyle(track).direction === 'rtl';
    track.scrollBy({ left: step * direction * (rtl ? -1 : 1), behavior: 'smooth' });
  };

  return (
    <section className="home-testimonials-section" aria-labelledby="testimonials-h">
      <div className="container">
        <h2 id="testimonials-h" className="home-section-title home-testimonials__title reveal">
          {t('title')}
        </h2>
        <div className="home-testimonials">
          <button
            type="button"
            className="home-testimonials__nav"
            aria-label={t('previous')}
            onClick={() => scrollByCard(-1)}
            disabled={edges.start}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <ul
            ref={trackRef}
            className="home-testimonials__track"
            role="list"
            onScroll={updateEdges}
            data-reveal-cards
          >
            {ITEMS.map((key, index) => {
              const name = t(`${key}Name`);
              const initials = name
                .split(/\s+/u)
                .map((part) => part[0])
                .slice(0, 2)
                .join('');
              return (
                <li
                  className="home-testimonial reveal"
                  key={key}
                  style={{ '--reveal-i': index } as CSSProperties}
                >
                  <span className="home-testimonial__avatar" aria-hidden="true">
                    {initials}
                  </span>
                  <figure>
                    <figcaption>
                      <strong>{name}</strong>
                      <span>{t(`${key}Role`)}</span>
                    </figcaption>
                    <span className="home-testimonial__stars" role="img" aria-label={t('rating')}>
                      {[0, 1, 2, 3, 4].map((star) => (
                        <Star key={star} aria-hidden="true" />
                      ))}
                    </span>
                    <blockquote>{t(`${key}Quote`)}</blockquote>
                  </figure>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="home-testimonials__nav"
            aria-label={t('next')}
            onClick={() => scrollByCard(1)}
            disabled={edges.end}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
