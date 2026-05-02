'use client';
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    const scriptId = 'cf-turnstile-api';
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      document.head.appendChild(s);
    }
    const check = setInterval(() => {
      if (window.turnstile && ref.current && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: onToken,
        });
        clearInterval(check);
      }
    }, 100);
    return () => {
      clearInterval(check);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} />;
}
