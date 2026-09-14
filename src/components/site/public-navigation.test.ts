import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import ar from '@/messages/ar.json';
import en from '@/messages/en.json';
import { PUBLIC_NAV_ITEMS, isPublicNavCurrent } from './public-navigation';

const rendererSource = readFileSync(new URL('./PublicNavLinks.tsx', import.meta.url), 'utf8');
const pendingSource = readFileSync(
  new URL('./PublicLinkPendingIndicator.tsx', import.meta.url),
  'utf8',
);
const headerSource = readFileSync(new URL('./SiteHeader.tsx', import.meta.url), 'utf8');
const mobileSource = readFileSync(new URL('./MobileNav.tsx', import.meta.url), 'utf8');
const userMenuSource = readFileSync(new URL('./UserMenu.tsx', import.meta.url), 'utf8');
const languageSwitcherSource = readFileSync(
  new URL('../i18n/LanguageSwitcher.tsx', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);
const publicLayoutSource = readFileSync(
  new URL('../../app/(public)/layout.tsx', import.meta.url),
  'utf8',
);
const authLayoutSource = readFileSync(
  new URL('../../app/(auth)/layout.tsx', import.meta.url),
  'utf8',
);
const accountLayoutSource = readFileSync(
  new URL('../../app/account/layout.tsx', import.meta.url),
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

describe('shared public header layout integration', () => {
  it('uses the homepage header on public, auth, and account routes', () => {
    for (const [layoutName, source] of [
      ['public', publicLayoutSource],
      ['auth', authLayoutSource],
      ['account', accountLayoutSource],
    ] as const) {
      assert.match(
        source,
        /import \{ SiteHeader \} from '@\/components\/site\/SiteHeader'/u,
        `${layoutName} layout must import SiteHeader`,
      );
      assert.equal(
        source.match(/<SiteHeader\b/gu)?.length,
        1,
        `${layoutName} layout must render exactly one SiteHeader opening tag`,
      );
    }
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
    assert.match(pendingSource, /useTranslations\('site'\)/u);
    assert.match(pendingSource, /pending\s*\?\s*t\('loadingPage'\)/u);
    assert.equal(en.site.loadingPage, 'Loading page');
    assert.equal(ar.site.loadingPage, 'جارٍ تحميل الصفحة');
    assert.match(cssSource, /\.site-public \.public-link-pending__spinner/u);
  });
});

describe('SiteHeader responsive navigation integration', () => {
  it('renders the shared header frame with a localized contact bar', () => {
    assert.match(
      headerSource,
      /import \{ PublicHeaderFrame \} from ['"]\.\/PublicHeaderFrame['"]/u,
    );
    assert.match(headerSource, /<PublicHeaderFrame>/u);
    assert.match(headerSource, /<div className="public-topbar">/u);
    assert.match(headerSource, /tSite\('footer\.description'\)/u);
    assert.match(headerSource, /href="mailto:hello@mandoob\.ae"/u);
    assert.match(headerSource, /href="tel:\+97145550123"/u);
    assert.match(headerSource, /<bdi>hello@mandoob\.ae<\/bdi>/u);
    assert.match(headerSource, /<bdi>\+971 4 555 0123<\/bdi>/u);
    assert.match(headerSource, /className="public-topbar__separator" aria-hidden="true"/u);
    assert.match(
      headerSource,
      /aria-label=\{tSite\('contactEmailLabel', \{ email: 'hello@mandoob\.ae' \}\)\}/u,
    );
    assert.match(
      headerSource,
      /aria-label=\{tSite\('contactPhoneLabel', \{ phone: '\+971 4 555 0123' \}\)\}/u,
    );
    assert.match(headerSource, /<div className="nav" data-route-progress-anchor>/u);
    assert.doesNotMatch(headerSource, /<header\b/u);
  });

  it('localizes the native contact link labels in both message catalogs', () => {
    for (const [locale, messages] of [
      ['en', en],
      ['ar', ar],
    ] as const) {
      assert.equal(typeof messages.site.contactEmailLabel, 'string', `${locale} email label`);
      assert.equal(typeof messages.site.contactPhoneLabel, 'string', `${locale} phone label`);
      assert.notEqual(messages.site.contactEmailLabel.trim(), '', `${locale} email label`);
      assert.notEqual(messages.site.contactPhoneLabel.trim(), '', `${locale} phone label`);
      assert.match(messages.site.contactEmailLabel, /\{email\}/u, `${locale} email placeholder`);
      assert.match(messages.site.contactPhoneLabel, /\{phone\}/u, `${locale} phone placeholder`);
    }
  });

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
      /\{session \? \([^]*<UserMenu[^]*\) : \([^]*href="\/login"[^]*\)\}/u,
    );
    assert.equal(headerSource.match(/href="\/estimate"/gu)?.length, 1);
    assert.match(
      headerSource,
      /contrastMode === 'authenticated' && session \? 'btn--authenticated-accent' : ''/u,
    );
    assert.doesNotMatch(headerSource, /tCommon\('getStarted'\)/u);
  });

  it('uses the public language switcher variant on desktop', () => {
    assert.match(headerSource, /<LanguageSwitcher\b[^>]*\bvariant="public"[^>]*\/>/u);
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

  it('uses the public language switcher variant in the mobile dialog', () => {
    assert.match(mobileSource, /<LanguageSwitcher\b[^>]*\bvariant="public"[^>]*\/>/u);
  });
});

describe('public header dropdown focus contract', () => {
  it('removes restored focus only after pointer dismissal', () => {
    for (const [controlName, source] of [
      ['language switcher', languageSwitcherSource],
      ['account menu', userMenuSource],
    ] as const) {
      assert.match(source, /const triggerRef = useRef<HTMLButtonElement>\(null\)/u, controlName);
      assert.match(source, /const pointerDismissedRef = useRef\(false\)/u, controlName);
      assert.match(source, /ref=\{triggerRef\}/u, controlName);
      assert.match(source, /onPointerDownOutside=/u, controlName);
      assert.match(
        source,
        /onCloseAutoFocus=\{\(event\) => \{[^}]*if \(!pointerDismissedRef\.current\) return;[^}]*event\.preventDefault\(\);[^}]*triggerRef\.current\?\.blur\(\);/u,
        controlName,
      );
    }
  });
});

describe('public header navigation styling contract', () => {
  it('keeps the complete public header frame sticky above page content', () => {
    assert.match(
      cssSource,
      /\.site-public\.public-header-frame\s*\{[^}]*position:\s*sticky[^}]*top:\s*0[^}]*z-index:\s*50[^}]*block-size:\s*96px[^}]*pointer-events:\s*none/u,
    );
    assert.match(
      cssSource,
      /\.site-public\.public-header-frame\s*\{[^}]*background:\s*transparent/u,
    );
    assert.doesNotMatch(
      cssSource,
      /\.site-public \.nav\s*\{[^}]*(?:position:\s*sticky|top:\s*0|z-index:\s*50)/u,
    );
    assert.match(cssSource, /\.site-public \.public-topbar\s*\{[^}]*pointer-events:\s*auto/u);
    assert.match(cssSource, /\.site-public \.nav\s*\{[^}]*pointer-events:\s*auto/u);
  });

  it('animates the contact bar closed as a clipped grid row', () => {
    assert.match(
      cssSource,
      /\.site-public \.public-topbar\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*1fr[^}]*transition:[^}]*grid-template-rows 420ms/u,
    );
    assert.doesNotMatch(
      cssSource,
      /\.site-public \.public-topbar\s*\{[^}]*(?:opacity|transition:[^}]*opacity)/u,
    );
    assert.match(
      cssSource,
      /\.site-public\.public-header-frame\[data-collapsed='true'\] \.public-topbar\s*\{[^}]*grid-template-rows:\s*0fr/u,
    );
    assert.doesNotMatch(
      cssSource,
      /\.site-public\.public-header-frame\[data-collapsed='true'\] \.public-topbar\s*\{[^}]*opacity/u,
    );
    assert.doesNotMatch(
      cssSource,
      /\.site-public(?:\.public-header-frame\[data-collapsed='true'\])? \.public-topbar__inner\s*\{[^}]*(?:transform|transition)/u,
    );
  });

  it('uses the shared small typography token for desktop contact copy', () => {
    assert.match(
      cssSource,
      /\.site-public \.public-topbar__tagline\s*\{[^}]*font-size:\s*var\(--fs-12\)/u,
    );
    assert.match(
      cssSource,
      /\.site-public \.public-topbar__contacts a\s*\{[^}]*font-size:\s*var\(--fs-12\)/u,
    );
  });

  it('keeps the mobile contact row compact by hiding its tagline', () => {
    assert.match(
      cssSource,
      /@media\s*\(max-width:\s*767px\)[^]*\.site-public \.public-topbar__tagline\s*\{[^}]*display:\s*none/u,
    );
  });

  it('disables contact bar movement when reduced motion is requested', () => {
    assert.match(
      cssSource,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[^]*\.site-public \.public-topbar\s*\{[^}]*transition:\s*none/u,
    );
  });

  it('gives desktop links a contrast-safe current state distinct from hover and focus', () => {
    assert.match(
      cssSource,
      /\.site-public \.nav__links a\s*\{[^}]*border-bottom:\s*2px solid transparent/u,
    );
    assert.match(
      cssSource,
      /\.site-public \.nav__links a\[aria-current='page'\]\s*\{[^}]*border-bottom:\s*2px solid var\(--accent\)[^}]*color:\s*var\(--public-cta-background\)/u,
    );
    assert.doesNotMatch(
      cssSource,
      /\.site-public \.nav__links a(?:\[aria-current='page'\])?\s*\{[^}]*border-inline-start/u,
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

  it('presents language and sign-in as one flat secondary action tier', () => {
    assert.match(
      cssSource,
      /\.site-public \.nav__cta > \.link-muted,\s*\.site-public \.language-switcher__trigger--public\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*padding-inline:\s*10px[^}]*border:\s*1px solid transparent[^}]*border-radius:\s*var\(--r-md\)[^}]*color:\s*var\(--zinc-600\)[^}]*background:\s*transparent[^}]*font-size:\s*var\(--fs-14\)[^}]*font-weight:\s*500/u,
    );
    assert.match(
      cssSource,
      /\.site-public \.nav__cta > \.link-muted:hover,\s*\.site-public \.language-switcher__trigger--public:hover,\s*\.site-public \.language-switcher__trigger--public\[data-state='open'\]\s*\{[^}]*background:\s*var\(--public-surface\)[^}]*color:\s*var\(--ink\)/u,
    );
  });

  it('styles the public language trigger as a compact dropdown control', () => {
    assert.match(
      cssSource,
      /\.site-public \.language-switcher__trigger--public\s*\{[^}]*min-block-size:\s*44px/u,
    );
    assert.match(
      cssSource,
      /\.site-public \.language-switcher__trigger--public\s*\{[^}]*line-height:\s*1/u,
    );
    assert.match(
      cssSource,
      /\.site-public \.language-switcher__trigger--public:hover,\s*\.site-public \.language-switcher__trigger--public\[data-state='open'\]/u,
    );
  });

  it('animates the public language chevron only while open', () => {
    assert.match(
      cssSource,
      /\.site-public \.language-switcher__trigger--public svg:last-child\s*\{[^}]*transition:\s*transform var\(--dur\) var\(--ease\)/u,
    );
    assert.match(
      cssSource,
      /\.site-public \.language-switcher__trigger--public\[data-state='open'\] svg:last-child\s*\{[^}]*transform:\s*rotate\(180deg\)/u,
    );
    assert.doesNotMatch(
      cssSource,
      /\.site-public \.language-switcher__trigger--public(?:\s|:hover)+svg:last-child\s*\{[^}]*transform:\s*rotate/u,
    );
    assert.match(
      cssSource,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[^]*\.site-public \.language-switcher__trigger--public svg:last-child\s*\{[^}]*transition:\s*none/u,
    );
  });

  it('sizes the portaled public language menu and keeps its indicator RTL-safe', () => {
    assert.match(
      cssSource,
      /\.language-switcher__content--public\s*\{[^}]*min-inline-size:\s*160px[^}]*padding:\s*4px/u,
    );
    for (const token of [
      /--popover:\s*oklch\(0\.205 0\.008 45\)/u,
      /--popover-foreground:\s*oklch\(0\.967 0\.005 45\)/u,
      /--accent:\s*oklch\(0\.268 0\.008 45\)/u,
      /--accent-foreground:\s*oklch\(0\.967 0\.005 45\)/u,
      /--border:\s*oklch\(1 0 0 \/ 12%\)/u,
    ]) {
      assert.match(
        cssSource,
        new RegExp(String.raw`\.language-switcher__content--public\s*\{[^}]*${token.source}`, 'u'),
      );
    }
    assert.match(
      cssSource,
      /\.language-switcher__item--public\s*\{[^}]*min-block-size:\s*44px[^}]*font-size:\s*0\.875rem/u,
    );
    assert.match(
      cssSource,
      /\.language-switcher__item--public\s*\{[^}]*padding-inline:\s*12px 32px/u,
    );
    assert.match(
      cssSource,
      /\.language-switcher__item--public > span\s*\{[^}]*right:\s*auto[^}]*inset-inline-end:\s*8px/u,
    );
  });
});
