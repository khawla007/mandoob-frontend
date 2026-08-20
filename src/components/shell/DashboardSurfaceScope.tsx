'use client';

import { useEffect } from 'react';

const DASHBOARD_SURFACE_ACTIVE_CLASS = 'dashboard-surface-active';

type DashboardSurfaceRoot = {
  classList: Pick<DOMTokenList, 'add' | 'remove'>;
};

const activeScopes = new WeakMap<object, number>();

export function acquireDashboardSurfaceScope(root: DashboardSurfaceRoot): () => void {
  const key = root as object;
  activeScopes.set(key, (activeScopes.get(key) ?? 0) + 1);
  root.classList.add(DASHBOARD_SURFACE_ACTIVE_CLASS);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (activeScopes.get(key) ?? 1) - 1;
    if (remaining > 0) {
      activeScopes.set(key, remaining);
      return;
    }
    activeScopes.delete(key);
    root.classList.remove(DASHBOARD_SURFACE_ACTIVE_CLASS);
  };
}

export function DashboardSurfaceScope() {
  useEffect(() => acquireDashboardSurfaceScope(document.body), []);
  return null;
}
