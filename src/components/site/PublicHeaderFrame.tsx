'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

const COLLAPSE_AT = 40;
const EXPAND_AT = 12;

export function resolveHeaderCollapsed(
  scrollY: number,
  current: boolean,
  topbarHasFocus = false,
): boolean {
  if (topbarHasFocus) return false;
  return current ? scrollY > EXPAND_AT : scrollY > COLLAPSE_AT;
}

export function PublicHeaderFrame({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const frameRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let pendingFrame: number | null = null;

    const handleScrollUpdate = () => {
      pendingFrame = null;
      const topbarHasFocus =
        frameRef.current?.querySelector('.public-topbar')?.contains(document.activeElement) ??
        false;
      setCollapsed((current) => resolveHeaderCollapsed(window.scrollY, current, topbarHasFocus));
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

  const headerChildren = Children.map(children, (child) => {
    if (
      !isValidElement<HTMLAttributes<HTMLElement> & { inert?: boolean }>(child) ||
      child.props.className !== 'public-topbar'
    ) {
      return child;
    }

    return cloneElement(child, {
      inert: collapsed,
      'aria-hidden': collapsed,
    });
  });

  return (
    <header
      ref={frameRef}
      className="site-public public-header-frame"
      data-collapsed={collapsed}
      role="banner"
    >
      {headerChildren}
    </header>
  );
}
