'use client';

import { useEffect } from 'react';

/**
 * Cuberto-style entrance reveal.
 *
 * Renders nothing. Adds `reveal-on` to `.site-public` (idempotent — also added
 * by ScrollReveal), then drives three motion paths:
 *
 * 1. Hero on-mount: every `.hero .reveal` reveal-group fires via double-rAF
 *    (paint hidden frame first, THEN flip to `is-in` so the transition runs).
 *    Hero items NOT inside `[data-reveal-cards]` get a `transitionDelay`
 *    spaced 90 ms apart.
 *
 * 2. Per-item card stagger: each `[data-reveal-cards]` group is observed
 *    by IntersectionObserver. On intersect, its `.reveal` descendants
 *    reveal in DOM order at 90 ms stagger.
 *
 * 3. Orphan `.reveal` elements (NOT inside `.hero` and NOT inside a
 *    `[data-reveal-cards]` group) are observed individually and reveal
 *    themselves when they intersect.
 *
 * Reduced-motion / no-IO -> all targets get `.is-in` synchronously on mount.
 */
const STAGGER_MS = 90;
const HERO_BASE_DELAY_MS = 80;

export function EntranceReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.site-public');
    if (!root) return;

    const hero = Array.from(root.querySelectorAll<HTMLElement>('.hero .reveal'));
    const groupNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal-cards]'));
    const orphans = Array.from(root.querySelectorAll<HTMLElement>('.reveal')).filter(
      (el) => !el.closest('.hero') && !el.closest('[data-reveal-cards]'),
    );

    if (hero.length === 0 && groupNodes.length === 0 && orphans.length === 0) return;

    root.classList.add('reveal-on');

    const revealGroup = (els: HTMLElement[], base = 0) => {
      els.forEach((el, i) => {
        el.style.transitionDelay = `${base + i * STAGGER_MS}ms`;
        el.classList.add('is-in');
      });
    };
    const showAll = (els: HTMLElement[]) => els.forEach((el) => el.classList.add('is-in'));

    const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduce || !('IntersectionObserver' in window)) {
      showAll(hero);
      groupNodes.forEach((g) => showAll(Array.from(g.querySelectorAll<HTMLElement>('.reveal'))));
      showAll(orphans);
      return;
    }

    // Double-rAF: paint the opacity:0 starting frame, then flip to is-in
    // so the transition actually runs (single rAF coalesces both into one paint).
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => revealGroup(hero, HERO_BASE_DELAY_MS));
    });

    const groupMap = new WeakMap<Element, HTMLElement[]>();
    groupNodes.forEach((g) =>
      groupMap.set(g, Array.from(g.querySelectorAll<HTMLElement>('.reveal'))),
    );
    orphans.forEach((el) => groupMap.set(el, [el]));

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const items = groupMap.get(entry.target);
          if (items) revealGroup(items, 0);
          obs.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );
    groupNodes.forEach((g) => io.observe(g));
    orphans.forEach((el) => io.observe(el));

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      io.disconnect();
    };
  }, []);

  return null;
}
