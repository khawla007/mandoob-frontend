import 'server-only';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getSessionProfile } from '@/lib/auth/require-user';
import { resolveRoleHome } from '@/lib/auth/role-home';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { UserMenu } from './UserMenu';

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

export async function SiteHeader() {
  const session = await getSessionProfile();
  const displayName = session ? await getDisplayName(session.id) : null;
  const homeHref = session
    ? await resolveRoleHome({ role: session.role, tenantId: session.tenantId })
    : '/login';
  const workspaceSlug =
    session?.role === 'customer' ? await getCustomerWorkspaceSlug(session.tenantId) : null;
  const tAuth = await getTranslations('auth');
  const tSite = await getTranslations('site');
  const tCommon = await getTranslations('common');

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <Link href="/" className="text-lg font-semibold">
        Mandoob
      </Link>
      <nav aria-label={tSite('primaryNav')} className="flex items-center gap-6 text-sm">
        <Link href="/estimate" className="hover:text-foreground text-muted-foreground">
          {tSite('estimate')}
        </Link>
        <Link href="/knowledge-base" className="hover:text-foreground text-muted-foreground">
          {tSite('knowledgeBase')}
        </Link>
        <Link href="/pricing" className="hover:text-foreground text-muted-foreground">
          {tSite('pricing')}
        </Link>
        <LanguageSwitcher />
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
              {tAuth('signIn')}
            </Link>
            <Link
              href="/register"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 font-medium"
            >
              {tCommon('getStarted')}
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
