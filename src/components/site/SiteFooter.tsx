import 'server-only';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

interface SiteFooterProps {
  locale: Locale | 'en';
}

export async function SiteFooter({ locale }: SiteFooterProps) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <footer className="text-muted-foreground border-t px-6 py-6 text-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-4">
          <Link href="/knowledge-base" className="hover:text-foreground">
            {t('footer.knowledgeBase')}
          </Link>
          <Link href="/estimate" className="hover:text-foreground">
            {t('footer.estimate')}
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            {t('footer.pricing')}
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground">
            {t('footer.privacy')}
          </Link>
          <Link href="/legal/terms" className="hover:text-foreground">
            {t('footer.terms')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
