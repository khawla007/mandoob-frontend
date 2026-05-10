'use client';

import { useEffect } from 'react';

export function BulkImportAutoRefresh({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => window.location.reload(), 3000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return null;
}
