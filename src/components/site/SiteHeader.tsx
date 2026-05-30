import 'server-only';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getSessionProfile } from '@/lib/auth/require-user';
import { resolveRoleHome } from '@/lib/auth/role-home';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { UserMenu } from './UserMenu';
import { MobileNav } from './MobileNav';

function BrandMark() {
  return (
    <span className="nav__mark" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 26 26">
        <rect x="1.5" y="1.5" width="23" height="23" rx="5" fill="#000" />
        <path
          d="M8 18V8l5 5 5-5v10"
          stroke="#fff"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

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

  const navLinks = [
    { href: '/#services', label: 'Platform' },
    { href: '/estimate', label: tSite('estimate') },
    { href: '/#pro-suite', label: 'Solutions' },
    { href: '/#trust', label: 'Trust' },
    { href: '/pricing', label: tSite('pricing') },
  ];

  return (
    <div className="site-public">
      <header className="nav" role="banner" data-route-progress-anchor>
        <div className="nav__inner container">
          <Link href="/" className="nav__brand" aria-label="Mandoob home">
            <BrandMark />
            <span className="nav__brandName">Mandoob</span>
          </Link>

          <nav className="nav__links" aria-label={tSite('primaryNav')}>
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="nav__cta">
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
                <Link className="link-muted" href="/login">
                  {tAuth('signIn')}
                </Link>
                <Link className="btn btn--accent btn--sm" href="/estimate">
                  {tCommon('getStarted')}
                </Link>
              </>
            )}
          </div>

          <MobileNav
            links={navLinks}
            authed={Boolean(session)}
            signInLabel={tAuth('signIn')}
            ctaLabel={tCommon('getStarted')}
          />
        </div>
      </header>
    </div>
  );
}
