'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const ROUTE_START_EVENT = 'mandoob:route-start';
const MAX_PENDING_MS = 30_000;

export function startRouteProgress() {
  window.dispatchEvent(new Event(ROUTE_START_EVENT));
}

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const [width, setWidth] = useState(0);
  const startPathRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  };

  const updateTop = () => {
    const anchor = document.querySelector<HTMLElement>('[data-route-progress-anchor]');
    const bottom = anchor?.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty(
      '--route-progress-top',
      `${Math.max(0, Math.round(bottom ?? 0))}px`,
    );
  };

  const finish = () => {
    clearTimers();
    setDone(true);
    setWidth(100);
    timeoutRef.current = window.setTimeout(() => {
      setActive(false);
      setDone(false);
      setWidth(0);
      startPathRef.current = null;
    }, 220);
  };

  const start = () => {
    clearTimers();
    updateTop();
    startPathRef.current = `${window.location.pathname}${window.location.search}`;
    setActive(true);
    setDone(false);
    setWidth(8);

    intervalRef.current = window.setInterval(() => {
      setWidth((current) => {
        if (current < 55) return current + 7;
        if (current < 82) return current + 2;
        if (current < 92) return current + 0.5;
        return current;
      });
    }, 280);

    timeoutRef.current = window.setTimeout(finish, MAX_PENDING_MS);
  };

  useEffect(() => {
    if (active && startPathRef.current && startPathRef.current !== currentPath) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish is intentionally stable enough for route commit cleanup.
  }, [active, currentPath]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const link = (event.target as Element | null)?.closest('a[href]');
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== '_self') return;

      const next = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);
      if (next.origin !== current.origin) return;
      if (next.pathname === current.pathname && next.search === current.search) return;
      start();
    };

    const stop = () => {
      clearTimers();
      setActive(false);
      setDone(false);
      setWidth(0);
      startPathRef.current = null;
    };
    const onResize = () => updateTop();
    window.addEventListener(ROUTE_START_EVENT, start);
    window.addEventListener('pageshow', stop);
    window.addEventListener('resize', onResize);
    document.addEventListener('click', onClick, true);
    updateTop();
    return () => {
      window.removeEventListener(ROUTE_START_EVENT, start);
      window.removeEventListener('pageshow', stop);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', onClick, true);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- window listeners should be registered once.
  }, []);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed top-[var(--route-progress-top,64px)] right-0 left-0 z-[100] h-0.5 overflow-hidden bg-orange-500/15">
      <div
        data-route-progress-bar
        className="h-full bg-orange-600 shadow-[0_0_12px_rgba(234,88,12,0.55)] transition-[width] duration-300 ease-out"
        style={{ width: `${width}%`, transitionDuration: done ? '180ms' : undefined }}
      />
    </div>
  );
}
