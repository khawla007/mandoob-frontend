'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * next-themes renders an inline theme script inside this client component.
 * React 19 logs "Encountered a script tag while rendering React component" when
 * that script is rendered on the client. The script only needs to run from the
 * server HTML (to set the theme class before paint), so on the client it is
 * marked as a non-executable data block, which React does not warn about. The
 * resulting attribute difference is covered by the script's own
 * suppressHydrationWarning.
 */
const clientScriptProps =
  typeof window === 'undefined' ? undefined : ({ type: 'application/json' } as const);

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider scriptProps={clientScriptProps} {...props}>
      {children}
    </NextThemesProvider>
  );
}
