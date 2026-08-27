'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function PublicThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('site');
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const nextAction = mounted && resolvedTheme === 'dark' ? 'themeUseLight' : 'themeUseDark';

  return (
    <button
      type="button"
      className="public-theme-toggle"
      aria-label={t(nextAction)}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="public-theme-toggle__icon--sun" aria-hidden="true" size={18} />
      <Moon className="public-theme-toggle__icon--moon" aria-hidden="true" size={18} />
    </button>
  );
}
