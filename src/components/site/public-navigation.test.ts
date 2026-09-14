import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PUBLIC_NAV_ITEMS, isPublicNavCurrent } from './public-navigation';

const rendererSource = readFileSync(new URL('./PublicNavLinks.tsx', import.meta.url), 'utf8');
const pendingSource = readFileSync(
  new URL('./PublicLinkPendingIndicator.tsx', import.meta.url),
  'utf8',
);
const headerSource = readFileSync(new URL('./SiteHeader.tsx', import.meta.url), 'utf8');
const mobileSource = readFileSync(new URL('./MobileNav.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(
  new URL('../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);

describe('public navigation contract', () => {
  it('defines the shared navigation destinations in display order', () => {
    assert.deepEqual(PUBLIC_NAV_ITEMS, [
      { id: 'platform', href: '/#services', currentPath: '/' },
      { id: 'estimate', href: '/estimate', currentPath: '/estimate' },
      { id: 'customers', href: '/#customers' },
      { id: 'forPros', href: '/pro', currentPath: '/pro' },
      { id: 'pricing', href: '/pricing', currentPath: '/pricing' },
    ]);
  });

  it('marks Platform current only on the homepage', () => {
    assert.equal(isPublicNavCurrent('/', '/'), true);
    assert.equal(isPublicNavCurrent('/', '/estimate'), false);
  });

  it('never marks Customers current because it has no matcher', () => {
    assert.equal(isPublicNavCurrent(undefined, '/'), false);
    assert.equal(isPublicNavCurrent(undefined, '/customers'), false);
  });

  it('uses exact path matching instead of prefix matching', () => {
    assert.equal(isPublicNavCurrent('/pricing', '/pricing'), true);
    assert.equal(isPublicNavCurrent('/pricing', '/pricing/extra'), false);
  });
});

describe('PublicNavLinks renderer contract', () => {
  it('is the pathname-aware client boundary', () => {
    assert.match(rendererSource, /^'use client';/);
    assert.match(rendererSource, /usePathname/);
  });

  it('applies page semantics through the shared matcher', () => {
    assert.match(rendererSource, /isPublicNavCurrent/);
    assert.match(rendererSource, /aria-current=\{[^}]*['"]page['"]/);
  });

  it('supports an optional navigation callback', () => {
    assert.match(rendererSource, /onNavigate\?/);
    assert.match(rendererSource, /onNavigate\?\.\(\)/);
  });

  it('renders a real status-safe pending presentation inside each shared navigation link', () => {
    assert.match(rendererSource, /<PublicLinkPendingIndicator\s*\/>/u);
    assert.match(pendingSource, /useLinkStatus/u);
    assert.match(pendingSource, /role="status"/u);
    assert.match(pendingSource, /pending\s*\?\s*'Loading page'/u);
    assert.match(cssSource, /\.site-public \.public-link-pending__spinner/u);
  });
});

describe('SiteHeader responsive navigation integration', () => {
  it('maps the shared model exactly once into one localized link array', () => {
    assert.match(
      headerSource,
      /const navLinks:\s*PublicNavLink\[\]\s*=\s*PUBLIC_NAV_ITEMS\.map\(\(item\)\s*=>/u,
    );
    assert.equal(headerSource.match(/PUBLIC_NAV_ITEMS\.map/gu)?.length, 1);
    assert.match(headerSource, /label:\s*tSite\(item\.id\)/u);
    assert.doesNotMatch(headerSource, /const navLinks\s*=\s*\[/u);
  });

  it('passes that same array to the shared desktop renderer and mobile navigation', () => {
    assert.match(
      headerSource,
      /<nav className="nav__links" aria-label=\{tSite\('primaryNav'\)\}>\s*<PublicNavLinks links=\{navLinks\} \/>\s*<\/nav>/u,
    );
    assert.equal(headerSource.match(/<MobileNav[^>]*links=\{navLinks\}/gu)?.length, 2);
    assert.equal(headerSource.match(/<nav\b[^>]*aria-label=/gu)?.length, 1);
    assert.match(headerSource, /mobileNavLabel=\{tSite\('mobileNav'\)\}/u);
  });

  it('uses the public theme control and preserves server-side session routing behavior', () => {
    assert.match(headerSource, /import 'server-only';/u);
    assert.match(headerSource, /export async function SiteHeader/u);
    assert.match(headerSource, /<PublicThemeToggle\s*\/>/u);
    assert.doesNotMatch(headerSource, /components\/admin\/ThemeToggle|<ThemeToggle/u);
    assert.match(headerSource, /getAuthoritativeSessionProfile/u);
    assert.doesNotMatch(headerSource, /\bgetSessionProfile\b/u);
    for (const behavior of [
      'getDisplayName',
      'getCustomerWorkspaceSlug',
      'resolveRoleHome',
      'workspaceSlug',
      '<UserMenu',
    ]) {
      assert.match(headerSource, new RegExp(behavior, 'u'));
    }
  });

  it('renders one dominant estimate action and session-aware desktop/mobile account actions', () => {
    assert.match(
      headerSource,
      /<UserMenu[^>]*homeHref=\{homeHref\}[^>]*workspaceSlug=\{workspaceSlug\}/u,
    );
    assert.match(headerSource, /accountHref=\{homeHref\}/u);
    assert.match(headerSource, /accountLabel=\{tSite\('openWorkspace'\)\}/u);
    assert.match(headerSource, /ctaLabel=\{tSite\('getEstimate'\)\}/u);
    assert.match(headerSource, /href="\/login"[^>]*>\s*\{tAuth\('signIn'\)\}/u);
    assert.match(
      headerSource,
      /\{session \? \([^]*<UserMenu[^]*\) : \([^]*href="\/login"[^]*\)\}\s*<Link className="btn btn--accent btn--sm" href="\/estimate">\s*\{tSite\('getEstimate'\)\}/u,
    );
    assert.equal(headerSource.match(/className="btn btn--accent btn--sm"/gu)?.length, 1);
    assert.doesNotMatch(headerSource, /tCommon\('getStarted'\)/u);
  });
});

describe('MobileNav authenticated destination type contract', () => {
  it('requires accountHref and accountLabel only for authenticated callers', () => {
    assert.match(
      mobileSource,
      /authed:\s*true;[^}]*accountHref:\s*string;[^}]*accountLabel:\s*string/u,
    );
    assert.match(
      mobileSource,
      /authed:\s*false;[^}]*accountHref\?:\s*never;[^}]*accountLabel\?:\s*never/u,
    );
    assert.doesNotMatch(mobileSource, /accountHref\s*=\s*['"]\/['"]/u);
  });
});

describe('public header navigation styling contract', () => {
  it('gives desktop links a contrast-safe current state distinct from hover and focus', () => {
    assert.match(
      cssSource,
      /\.site-public \.nav__links a\[aria-current='page'\]\s*\{[^}]*border-inline-start:\s*2px solid var\(--accent\)[^}]*color:\s*var\(--public-cta-background\)/u,
    );
    assert.match(cssSource, /\.site-public \.nav__links a:hover\s*\{[^}]*color:\s*var\(--ink\)/u);
    assert.match(
      cssSource,
      /\.site-public \.nav__links a:focus-visible\s*\{[^}]*background:\s*var\(--public-surface\)[^}]*color:\s*var\(--ink\)/u,
    );
  });

  it('keeps compact desktop utilities and all header controls at 44px targets', () => {
    assert.match(
      cssSource,
      /\.site-public \.nav__brand\s*\{[^}]*min-inline-size:\s*44px[^}]*min-block-size:\s*44px/u,
    );
    assert.match(
      cssSource,
      /\.site-public \.nav__links a\s*\{[^}]*min-inline-size:\s*44px[^}]*min-block-size:\s*44px/u,
    );
    assert.match(
      cssSource,
      /\.site-public \.nav__cta > (?:a|button)[^{]*\{[^}]*min-inline-size:\s*44px[^}]*min-block-size:\s*44px/u,
    );
    assert.match(
      cssSource,
      /\.site-public \.nav__menu\s*\{[^}]*min-inline-size:\s*44px[^}]*min-block-size:\s*44px/u,
    );
  });
});
