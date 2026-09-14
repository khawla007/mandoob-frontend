'use client';

import { useEffect, useState } from 'react';

export function DevelopmentRouteErrorEvidence({ enabled }: { enabled: boolean }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => setArmed(true), 0);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  if (armed) throw new Error('isolated development route error evidence');
  return null;
}
