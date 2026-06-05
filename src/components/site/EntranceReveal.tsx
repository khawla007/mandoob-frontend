'use client';

import { useEffect } from 'react';

const STAGGER_MS = 90;
const HERO_BASE_DELAY_MS = 0;

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
