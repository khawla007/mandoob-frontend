import 'server-only';
import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getAuthoritativeSessionProfile } from '@/lib/auth/require-role';
import { resolveRoleHome } from '@/lib/auth/role-home';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { UserMenu } from './UserMenu';
import { MobileNav } from './MobileNav';
import { PublicHeaderFrame } from './PublicHeaderFrame';
import { PublicNavLinks } from './PublicNavLinks';
import { PublicThemeToggle } from './PublicThemeToggle';
import { PUBLIC_NAV_ITEMS, type PublicNavLink } from './public-navigation';

function BrandMark() {
  return (
    <span className="nav__mark" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 26 26">
        <rect x="1.5" y="1.5" width="23" height="23" rx="5" fill="var(--ink)" />
        <path
          d="M8 18V8l5 5 5-5v10"
          stroke="var(--paper)"
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
  const [session, tAuth, tSite] = await Promise.all([
    getAuthoritativeSessionProfile(),
    getTranslations('auth'),
    getTranslations('site'),
  ]);
  const [displayName, homeHref, workspaceSlug] = session
    ? await Promise.all([
        getDisplayName(session.id),
        resolveRoleHome({ role: session.role, tenantId: session.tenantId }),
        session.role === 'customer'
          ? getCustomerWorkspaceSlug(session.tenantId)
          : Promise.resolve(null),
      ])
    : [null, '/login', null];

  const navLinks: PublicNavLink[] = PUBLIC_NAV_ITEMS.map((item) => ({
    ...item,
    label: tSite(item.id),
  }));

  return (
    <PublicHeaderFrame>
      <div className="public-topbar">
        <div className="public-topbar__clip">
          <div className="public-topbar__inner container">
            <p className="public-topbar__tagline">{tSite('footer.description')}</p>
            <address className="public-topbar__contacts">
              <a
                href="mailto:hello@mandoob.ae"
                aria-label={tSite('contactEmailLabel', { email: 'hello@mandoob.ae' })}
              >
                <Mail size={13} strokeWidth={1.8} aria-hidden="true" />
                <bdi>hello@mandoob.ae</bdi>
              </a>
              <span className="public-topbar__separator" aria-hidden="true" />
              <a
                href="tel:+97145550123"
                aria-label={tSite('contactPhoneLabel', { phone: '+971 4 555 0123' })}
              >
                <Phone size={13} strokeWidth={1.8} aria-hidden="true" />
                <bdi>+971 4 555 0123</bdi>
              </a>
            </address>
          </div>
        </div>
      </div>
      <div className="nav" data-route-progress-anchor>
        <div className="nav__inner container">
          <Link href="/" className="nav__brand" aria-label={tSite('brandHome')}>
            <BrandMark />
            <span className="nav__brandName">Mandoob</span>
          </Link>

          <nav className="nav__links" aria-label={tSite('primaryNav')}>
            <PublicNavLinks links={navLinks} />
          </nav>

          <div className="nav__cta">
            <PublicThemeToggle />
            <LanguageSwitcher
              variant="public"
              failureMessage={tSite('languageChangeFailed')}
              pendingLabel={tSite('languageChanging')}
            />
            {session ? (
              <UserMenu
                email={session.email}
                displayName={displayName}
                role={session.role}
                homeHref={homeHref}
                workspaceSlug={workspaceSlug}
              />
            ) : (
              <Link className="link-muted" href="/login">
                {tAuth('signIn')}
              </Link>
            )}
            <Link className="btn btn--accent btn--sm" href="/estimate">
              {tSite('getEstimate')}
            </Link>
          </div>

          {session ? (
            <MobileNav
              links={navLinks}
              authed={true}
              signInLabel={tAuth('signIn')}
              ctaLabel={tSite('getEstimate')}
              accountHref={homeHref}
              accountLabel={tSite('openWorkspace')}
              openMenuLabel={tSite('openMenu')}
              closeMenuLabel={tSite('closeMenu')}
              menuTitle={tSite('menuTitle')}
              mobileNavLabel={tSite('mobileNav')}
              languageFailureMessage={tSite('languageChangeFailed')}
              languagePendingLabel={tSite('languageChanging')}
            />
          ) : (
            <MobileNav
              links={navLinks}
              authed={false}
              signInLabel={tAuth('signIn')}
              ctaLabel={tSite('getEstimate')}
              openMenuLabel={tSite('openMenu')}
              closeMenuLabel={tSite('closeMenu')}
              menuTitle={tSite('menuTitle')}
              mobileNavLabel={tSite('mobileNav')}
              languageFailureMessage={tSite('languageChangeFailed')}
              languagePendingLabel={tSite('languageChanging')}
            />
          )}
        </div>
      </div>
    </PublicHeaderFrame>
  );
}
