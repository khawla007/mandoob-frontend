import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { RouteProgress } from '@/components/navigation/RouteProgress';
import { coerceLocale, dirOf } from '@/lib/i18n/config';
import './globals.css';
// design-4 marketing theme — fully namespaced under .site-public, so it only
// affects the shared SiteHeader/SiteFooter chrome and public pages, never dashboards.
import './(public)/public-theme.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mandoob',
  description: 'UAE Business Registration & PRO Management Platform',
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
