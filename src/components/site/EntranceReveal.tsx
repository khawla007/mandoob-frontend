'use client';

import { useEffect } from 'react';

/**
 * Cuberto-style entrance reveal — direct port of the design-4 sandbox
 * script (html-design/design-4/index.html lines 449-507). Behavior:
 *
 * 1. Hero on-mount: `.hero .reveal` items reveal-group via double rAF
 *    (paint hidden frame first, THEN flip to `is-in`), staggered 90 ms
 *    apart with an 80 ms base delay.
 *
 * 2. Per-item card stagger: each `[data-reveal-cards]` group is
 *    observed; on intersect its `.reveal` descendants reveal in DOM
 *    order at 90 ms stagger.
 *
 * 3. Orphan `.reveal` elements (outside `.hero` and outside any
 *    `[data-reveal-cards]` group) are observed individually.
 *
 * Reduced-motion or no IntersectionObserver -> every target gets
 * `.is-in` synchronously on mount.
 */
const STAGGER_MS = 90;
const HERO_BASE_DELAY_MS = 80;

type Target = { node: Element; items: HTMLElement[] };

export function EntranceReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.site-public');
    if (!root) return;

    const hero = Array.from(root.querySelectorAll<HTMLElement>('.hero .reveal'));

    const targets: Target[] = [];
    Array.from(root.querySelectorAll<HTMLElement>('[data-reveal-cards]')).forEach((g) => {
      targets.push({ node: g, items: Array.from(g.querySelectorAll<HTMLElement>('.reveal')) });
    });
    Array.from(root.querySelectorAll<HTMLElement>('.reveal')).forEach((el) => {
      if (el.closest('.hero')) return;
      if (el.closest('[data-reveal-cards]')) return;
      targets.push({ node: el, items: [el] });
    });

    if (hero.length === 0 && targets.length === 0) return;

    root.classList.add('reveal-on');

    const revealGroup = (els: HTMLElement[], baseDelay: number) => {
      els.forEach((el, i) => {
        el.style.transitionDelay = `${baseDelay + i * STAGGER_MS}ms`;
        el.classList.add('is-in');
      });
    };
    const showAll = (els: HTMLElement[]) => els.forEach((el) => el.classList.add('is-in'));

    const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduce || !('IntersectionObserver' in window)) {
      showAll(hero);
      targets.forEach((t) => showAll(t.items));
      return;
    }

    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => revealGroup(hero, HERO_BASE_DELAY_MS));
    });

    const dataMap = new WeakMap<Element, Target>();
    targets.forEach((t) => dataMap.set(t.node, t));

    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const t = dataMap.get(entry.target);
          if (t) revealGroup(t.items, 0);
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );
    targets.forEach((t) => io.observe(t.node));

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      io.disconnect();
    };
  }, []);

  return null;
}
