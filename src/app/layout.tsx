import type { Metadata } from 'next';
import { Suspense } from 'react';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { RouteProgress } from '@/components/navigation/RouteProgress';
import { coerceLocale, dirOf } from '@/lib/i18n/config';
import { PUBLIC_SITE_ORIGIN } from '@/lib/public-metadata';
import './globals.css';
// design-4 marketing theme — fully namespaced under .site-public, so it only
// affects the shared SiteHeader/SiteFooter chrome and public pages, never dashboards.
import './(public)/public-theme.css';

const geistSans = localFont({
  src: './fonts/Geist-Variable.ttf',
  variable: '--font-geist-sans',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
});

const geistMono = localFont({
  src: './fonts/GeistMono-Variable.ttf',
  variable: '--font-geist-mono',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
});

const notoKufiArabic = localFont({
  src: './fonts/NotoKufiArabic-Variable.ttf',
  variable: '--font-arabic',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: PUBLIC_SITE_ORIGIN,
  title: 'Mandoob | UAE Company Setup and PRO Support',
  description: 'Explore UAE Company setup paths and prepare for ongoing PRO support.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = coerceLocale(await getLocale());
  const messages = await getMessages();
  const dir = dirOf(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoKufiArabic.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Suspense fallback={null}>
              <RouteProgress />
            </Suspense>
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
