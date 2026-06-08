import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

interface HomeProps {
  params: Promise<{ locale: string }>;
}

export default async function ComingSoonPage({ params }: HomeProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(0.62_0.19_259/0.18),transparent_60%)]"
      />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
        <Badge variant="secondary" className="mb-8 font-mono text-xs tracking-wide">
          {t('badge')}
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{t('heroTitle')}</h1>
        <p className="text-muted-foreground mt-5 max-w-xl text-base md:text-lg">
          {t('heroSubtitle')}
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/estimate">{t('ctaEstimate')}</Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/login">{t('ctaSignIn')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/register">{t('ctaRegister')}</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
