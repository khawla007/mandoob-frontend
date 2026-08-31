'use client';

import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  previousLabel: string;
  nextLabel: string;
  ratingLabel: string;
  positionLabels: string[];
  direction: 'ltr' | 'rtl';
}

const CLONE_COUNT = 3;
const SWIPE_THRESHOLD = 42;

export function TestimonialsCarousel({
  testimonials,
  carouselLabel,
  previousLabel,
  nextLabel,
  ratingLabel,
  positionLabels,
  direction,
}: TestimonialsCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<number | null>(null);
  const transitionLockRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  const [index, setIndex] = useState(CLONE_COUNT);
  const [transitionEnabled, setTransitionEnabled] = useState(false);

  const slides = [
    ...testimonials.slice(-CLONE_COUNT),
    ...testimonials,
    ...testimonials.slice(0, CLONE_COUNT),
  ];
  const logicalIndex = (index - CLONE_COUNT + testimonials.length) % testimonials.length;

  const finishTransition = useCallback(() => {
    transitionLockRef.current = false;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);

    let resetIndex: number | null = null;
    if (index >= testimonials.length + CLONE_COUNT) resetIndex = CLONE_COUNT;
    if (index < CLONE_COUNT) resetIndex = testimonials.length + CLONE_COUNT - 1;

    if (resetIndex === null) return;
    setTransitionEnabled(false);
    setIndex(resetIndex);
  }, [index, testimonials.length]);

  const move = useCallback((step: -1 | 1) => {
    if (transitionLockRef.current) return;
    transitionLockRef.current = true;
    setTransitionEnabled(true);
    setIndex((current) => current + step);
    unlockTimerRef.current = setTimeout(() => {
      transitionLockRef.current = false;
    }, 500);
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateVisibleCount = () => {
      const width = viewport.getBoundingClientRect().width;
      const nextCount = width < 768 ? 1 : width < 1024 ? 2 : 3;
      setTransitionEnabled(false);
      setVisibleCount(nextCount);
    };

    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!transitionEnabled) {
      if (index >= testimonials.length + CLONE_COUNT) setIndex(CLONE_COUNT);
      if (index < CLONE_COUNT) setIndex(testimonials.length + CLONE_COUNT - 1);
      const animationFrame = requestAnimationFrame(() => setTransitionEnabled(true));
      return () => cancelAnimationFrame(animationFrame);
    }

    if (index < CLONE_COUNT || index >= testimonials.length + CLONE_COUNT) {
      resetTimerRef.current = setTimeout(finishTransition, 500);
      return () => {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      };
    }
  }, [finishTransition, index, testimonials.length, transitionEnabled]);

  useEffect(
    () => () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const rightIsNext = direction === 'ltr';
    move((event.key === 'ArrowRight') === rightIsNext ? 1 : -1);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStartRef.current === null) return;
    const delta = event.clientX - pointerStartRef.current;
    pointerStartRef.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    const nextGesture = direction === 'ltr' ? delta < 0 : delta > 0;
    move(nextGesture ? 1 : -1);
  };

  return (
    <div
      className="home-testimonials-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={carouselLabel}
      dir={direction}
    >
      <button
        type="button"
        className="home-testimonials-arrow"
        onClick={() => move(-1)}
        aria-label={previousLabel}
      >
        <span aria-hidden="true">{direction === 'rtl' ? '›' : '‹'}</span>
      </button>

      <div
        ref={viewportRef}
        className="home-testimonials-viewport"
        tabIndex={0}
        dir="ltr"
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          pointerStartRef.current = event.clientX;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerStartRef.current = null;
        }}
      >
        <div
          className={`home-testimonials-track${transitionEnabled ? 'is-animated' : ''}`}
          style={{ transform: `translate3d(-${index * (100 / visibleCount)}%, 0, 0)` }}
          onTransitionEnd={finishTransition}
        >
          {slides.map((testimonial, slideIndex) => {
            const isClone =
              slideIndex < CLONE_COUNT || slideIndex >= testimonials.length + CLONE_COUNT;
            return (
              <div
                className="home-testimonials-slide"
                key={`${testimonial.id}-${slideIndex}`}
                aria-hidden={isClone ? 'true' : undefined}
                dir={direction}
              >
                <article className="home-testimonial-card">
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
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="home-testimonials-arrow"
        onClick={() => move(1)}
        aria-label={nextLabel}
      >
        <span aria-hidden="true">{direction === 'rtl' ? '‹' : '›'}</span>
      </button>

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {positionLabels[logicalIndex]}
      </p>
    </div>
  );
}
