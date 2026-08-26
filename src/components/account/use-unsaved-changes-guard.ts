'use client';

import { useEffect, useRef } from 'react';

const activeGuards = new Map<symbol, string>();
let listening = false;

function clientNavigationAnchor(event: MouseEvent): HTMLAnchorElement | null {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !(event.target instanceof Element)
  ) {
    return null;
  }
  const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || anchor.hasAttribute('download')) return null;
  const target = anchor.getAttribute('target');
  if (target && target.toLowerCase() !== '_self') return null;

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return null;
  const current = new URL(window.location.href);
  if (
    destination.pathname === current.pathname &&
    destination.search === current.search &&
    destination.hash !== current.hash
  ) {
    return null;
  }
  if (destination.href === current.href) return null;
  return anchor;
}

function currentWarning(): string | null {
  return activeGuards.values().next().value ?? null;
}

function beforeunload(event: BeforeUnloadEvent) {
  const warning = currentWarning();
  if (!warning) return;
  event.preventDefault();
  event.returnValue = warning;
}

function click(event: MouseEvent) {
  const warning = currentWarning();
  if (!warning || !clientNavigationAnchor(event) || window.confirm(warning)) return;
  event.preventDefault();
  event.stopPropagation();
}

function updateListeners(): void {
  if (activeGuards.size > 0 && !listening) {
    window.addEventListener('beforeunload', beforeunload);
    document.addEventListener('click', click, true);
    listening = true;
  } else if (activeGuards.size === 0 && listening) {
    window.removeEventListener('beforeunload', beforeunload);
    document.removeEventListener('click', click, true);
    listening = false;
  }
}

export function useUnsavedChangesGuard(dirty: boolean, warning: string): void {
  const token = useRef<symbol | null>(null);
  if (token.current == null) token.current = Symbol('unsaved-changes');
  useEffect(() => {
    if (!dirty) return;
    const id = token.current!;
    activeGuards.set(id, warning);
    updateListeners();
    return () => {
      activeGuards.delete(id);
      updateListeners();
    };
  }, [dirty, warning]);
}
