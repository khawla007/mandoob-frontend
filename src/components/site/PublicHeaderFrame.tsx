'use client';

import { useEffect, useState, type ReactNode } from 'react';

const COLLAPSE_AT = 40;
const EXPAND_AT = 12;

export function resolveHeaderCollapsed(scrollY: number, current: boolean): boolean {
  return current ? scrollY > EXPAND_AT : scrollY > COLLAPSE_AT;
}

export function PublicHeaderFrame({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let pendingFrame: number | null = null;

    const handleScrollUpdate = () => {
      pendingFrame = null;
      setCollapsed((current) => resolveHeaderCollapsed(window.scrollY, current));
    };

    const handleScroll = () => {
      if (pendingFrame === null) {
        pendingFrame = window.requestAnimationFrame(handleScrollUpdate);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      if (pendingFrame !== null) {
        window.cancelAnimationFrame(pendingFrame);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <header className="site-public public-header-frame" data-collapsed={collapsed} role="banner">
      {children}
    </header>
  );
}
