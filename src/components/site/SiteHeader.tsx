import 'server-only';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getSessionProfile } from '@/lib/auth/require-user';
import { resolveRoleHome } from '@/lib/auth/role-home';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Locale } from '@/i18n/routing';
import { UserMenu } from './UserMenu';
import { LanguageSwitcher } from './LanguageSwitcher';

export const dynamic = 'force-dynamic';

async function getDisplayName(userId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  return (data?.full_name as string | null) ?? null;
}

async function getCustomerWorkspaceSlug(tenantId: string | null): Promise<string | null> {
  if (!tenantId) return null;
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
  const slug = (data?.slug as string | null) ?? null;
  return slug && slug !== 'pub' ? slug : null;
}

interface SiteHeaderProps {
  locale: Locale | 'en';
  showLanguageSwitcher?: boolean;
}

export async function SiteHeader({ locale, showLanguageSwitcher = false }: SiteHeaderProps) {
  const t = await getTranslations({ locale, namespace: 'common' });
  const session = await getSessionProfile();
  const displayName = session ? await getDisplayName(session.id) : null;
  const homeHref = session
    ? await resolveRoleHome({ role: session.role, tenantId: session.tenantId })
    : '/login';
  const workspaceSlug =
    session?.role === 'customer' ? await getCustomerWorkspaceSlug(session.tenantId) : null;

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <Link href="/" className="text-lg font-semibold">
        {t('brand')}
      </Link>
      <nav aria-label="Primary navigation" className="flex items-center gap-6 text-sm">
        <Link href="/estimate" className="hover:text-foreground text-muted-foreground">
          {t('nav.estimate')}
        </Link>
        <Link href="/knowledge-base" className="hover:text-foreground text-muted-foreground">
          {t('nav.knowledgeBase')}
        </Link>
        <Link href="/pricing" className="hover:text-foreground text-muted-foreground">
          {t('nav.pricing')}
        </Link>
        {showLanguageSwitcher && <LanguageSwitcher />}
        {session ? (
          <UserMenu
            email={session.email}
            displayName={displayName}
            role={session.role}
            homeHref={homeHref}
            workspaceSlug={workspaceSlug}
          />
        ) : (
          <>
            <Link href="/login" className="hover:text-foreground text-muted-foreground">
              {t('nav.signIn')}
            </Link>
            <Link
              href="/register"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 font-medium"
            >
              {t('nav.getStarted')}
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
