import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { AuthExperience } from '@/components/auth/AuthExperience';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('site');

  return (
    <div className="site-public flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        {t('skipToMain')}
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1">
        <AuthExperience>{children}</AuthExperience>
      </main>
      <SiteFooter />
    </div>
  );
}
