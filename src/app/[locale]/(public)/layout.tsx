import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/app/AppShell';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { routing } from '@/i18n/routing';
import { getDirection } from '@/lib/locale/getDirection';
import { notoSansArabic } from './fonts';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface MarketingLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function MarketingLayout({ children, params }: MarketingLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = getDirection(locale);
  const fontClass = locale === 'ar' ? notoSansArabic.variable : '';

  return (
    <AppShell lang={locale} dir={dir} fontVariableClassName={fontClass}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <div
          className={`flex min-h-screen flex-col ${locale === 'ar' ? 'font-[var(--font-noto-arabic)]' : ''}`}
        >
          <SiteHeader locale={locale} showLanguageSwitcher={true} />
          <div className="flex-1">{children}</div>
          <SiteFooter locale={locale} />
        </div>
      </NextIntlClientProvider>
    </AppShell>
  );
}
