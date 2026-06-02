'use client';

import { useEffect } from 'react';

/**
 * Reveals below-hero sections as they scroll into view.
 *
 * Renders nothing. On mount it adds `reveal-on` to the `.site-public` root
 * (which arms the hidden state in CSS) and observes every `[data-reveal]`
 * element, toggling `is-revealed` once each enters the viewport. The class is
 * only added when motion is allowed and IntersectionObserver exists, so no-JS
 * and reduced-motion users always see fully visible content.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.site-public');
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (targets.length === 0) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || !('IntersectionObserver' in window)) return;

    root.classList.add('reveal-on');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return null;
}
