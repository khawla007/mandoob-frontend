import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('public theme contracts run under the client React export condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

const css = readFileSync(new URL('../../app/(public)/public-theme.css', import.meta.url), 'utf8');
const toggleUrl = new URL('./PublicThemeToggle.tsx', import.meta.url);
const toggle = existsSync(toggleUrl) ? readFileSync(toggleUrl, 'utf8') : '';

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u'))?.[1];
  assert.ok(block, `missing ${selector} declarations`);
  return block;
}

function rawToken(block: string, name: string): string {
  const value = block.match(new RegExp(`--${name}:\\s*([^;]+);`, 'u'))?.[1].trim();
  assert.ok(value, `missing --${name}`);
  return value;
}

function token(block: string, name: string): string {
  const value = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'iu'))?.[1];
  assert.ok(value, `missing resolved --${name}`);
  return value;
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  assert.ok(channels && channels.length === 3);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const semanticRoles = [
  'public-canvas',
  'public-surface',
  'public-surface-elevated',
  'public-text-primary',
  'public-text-muted',
  'public-border-subtle',
  'public-border-strong',
  'public-accent-decoration',
  'public-cta-background',
  'public-cta-text',
  'public-cta-hover-background',
  'public-cta-active-background',
  'public-cta-focus-background',
  'public-cta-disabled-background',
  'public-cta-disabled-text',
  'public-header-surface',
  'public-mobile-dialog-surface',
  'public-focus-ring',
  'public-scrim',
] as const;

renderTest('public light and dark scopes expose the complete reusable semantic palette', () => {
  for (const selector of ['.site-public', '.dark .site-public']) {
    const block = declarations(selector);
    for (const role of semanticRoles) {
      assert.match(block, new RegExp(`--${role}:`, 'u'), `${selector} lacks --${role}`);
    }
  }
});

renderTest('sticky public header surfaces are solid in light and dark themes', () => {
  assert.equal(rawToken(declarations('.site-public'), 'public-header-surface'), 'var(--paper)');
  assert.equal(
    rawToken(declarations('.dark .site-public'), 'public-header-surface'),
    'var(--paper)',
  );
});

renderTest('public light tokens retain the accepted warm palette and fonts', () => {
  const block = declarations('.site-public');
  for (const name of ['paper', 'ink', 'zinc-50', 'zinc-500', 'zinc-950']) {
    assert.match(rawToken(block, name), /^oklch\(/u);
  }
  assert.equal(rawToken(block, 'accent'), 'var(--public-accent-decoration)');
  assert.equal(rawToken(block, 'public-accent-decoration'), 'var(--brand-accent)');
  assert.match(rawToken(block, 'font'), /^var\(--font-geist-sans\)(?:,|$)/u);
  assert.match(rawToken(block, 'mono-font'), /^var\(--font-geist-mono\)(?:,|$)/u);
});

renderTest('public dark tokens retain the warm inverted ramp', () => {
  const block = declarations('.dark .site-public');
  for (const name of ['paper', 'ink', 'zinc-50', 'zinc-500', 'zinc-950']) {
    assert.match(rawToken(block, name), /^oklch\(/u);
  }
  assert.match(declarations('.site-public .btn--accent'), /color:\s*var\(--public-cta-text\)/u);
});

renderTest('every public CTA state meets WCAG AA in both themes', () => {
  const pairs = [
    ['public-cta-background', 'public-cta-text'],
    ['public-cta-hover-background', 'public-cta-text'],
    ['public-cta-active-background', 'public-cta-text'],
    ['public-cta-focus-background', 'public-cta-text'],
    ['public-cta-disabled-background', 'public-cta-disabled-text'],
  ] as const;
  for (const selector of ['.site-public', '.dark .site-public']) {
    const block = declarations(selector);
    for (const [background, foreground] of pairs) {
      assert.ok(contrastRatio(token(block, background), token(block, foreground)) >= 4.5);
    }
  }
});

renderTest('public dark theme preserves a dark accent surface for flow markers', () => {
  assert.equal(rawToken(declarations('.dark .site-public'), 'accent-soft'), 'oklch(0.22 0.04 38)');
  assert.match(
    declarations('.site-public .home-flow-row__number'),
    /background:\s*var\(--accent-soft\)/u,
  );
});

renderTest('mobile dialog inherits the semantic CTA token', () => {
  assert.doesNotMatch(declarations('.site-public.public-mobile-dialog'), /--accent\s*:/u);
  assert.match(
    declarations('.site-public .btn--accent'),
    /background:\s*var\(--public-cta-background\)/u,
  );
});

renderTest('design-4 component colors and weights are preserved', () => {
  assert.match(
    declarations('.site-public .btn--accent'),
    /background:\s*var\(--public-cta-background\)[\s\S]*color:\s*var\(--public-cta-text\)/u,
  );
  assert.match(
    declarations('.site-public .btn--accent:hover'),
    /background:\s*var\(--public-cta-hover-background\)/u,
  );
  assert.match(declarations('.site-public .eyebrow'), /color:\s*var\(--zinc-500\)/u);
  assert.match(declarations('.site-public .eyebrow--accent'), /color:\s*var\(--zinc-500\)/u);
  assert.match(declarations('.site-public .cell__link'), /color:\s*var\(--accent\)/u);
  const homeLink = declarations('.site-public .home-text-link');
  assert.match(homeLink, /color:\s*var\(--accent\)/u);
  assert.match(homeLink, /font-size:\s*var\(--fs-14\)/u);
  assert.match(homeLink, /font-weight:\s*600\b/u);
});

renderTest('accent buttons consume semantic state tokens', () => {
  const button = declarations('.site-public .btn--accent');
  assert.match(button, /background:\s*var\(--public-cta-background\)/u);
  assert.match(button, /color:\s*var\(--public-cta-text\)/u);
  assert.match(
    css,
    /\.site-public \.btn--accent:hover\s*\{[^}]*var\(--public-cta-hover-background\)/u,
  );
  assert.match(
    css,
    /\.site-public \.btn--accent:disabled[^}]*var\(--public-cta-disabled-background\)/u,
  );
});

renderTest('accent-button overrides use the matching semantic states', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].filter(
    ([, selector, body]) =>
      /\.btn--accent(?![-\w])/u.test(selector) && /(?:^|;)\s*background\s*:/u.test(body),
  );
  assert.ok(rules.length >= 5, 'expected every base interactive accent-button rule');

  for (const [, selector, body] of rules) {
    const expected = selector.includes(':hover')
      ? '--public-cta-hover-background'
      : selector.includes(':active')
        ? '--public-cta-active-background'
        : selector.includes(':focus-visible')
          ? '--public-cta-focus-background'
          : selector.includes(':disabled') || selector.includes("[aria-disabled='true']")
            ? '--public-cta-disabled-background'
            : '--public-cta-background';
    assert.match(
      body,
      new RegExp(`background:\\s*var\\(${expected}\\)`, 'u'),
      `${selector.trim()} bypasses ${expected}`,
    );
  }
});

renderTest('accent-button color overrides preserve semantic CTA text', () => {
  const colorRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].filter(
    ([, selector, body]) =>
      /\.btn--accent(?![-\w])/u.test(selector) &&
      !/:disabled|\[aria-disabled=/u.test(selector) &&
      /(?:^|;)\s*color\s*:/u.test(body),
  );

  for (const [, selector, body] of colorRules) {
    assert.match(
      body,
      /color:\s*var\(--public-cta-text\)/u,
      `${selector.trim()} bypasses the semantic CTA text`,
    );
  }
});

renderTest('shell focus and sticky header consume roles while the dialog token stays dark', () => {
  assert.match(declarations('.site-public :focus-visible'), /var\(--public-focus-ring\)/u);
  assert.match(declarations('.site-public .nav'), /var\(--public-header-surface\)/u);
  assert.equal(
    token(declarations('.site-public'), 'public-mobile-dialog-surface'),
    token(declarations('.dark .site-public'), 'public-mobile-dialog-surface'),
    'the future full-screen mobile dialog stays editorial-dark in both themes',
  );
});

renderTest('current navigation and footer muted copy use design-4 semantic colors', () => {
  assert.match(
    declarations(".site-public .nav__links a[aria-current='page']"),
    /color:\s*var\(--public-cta-background\)/u,
  );
  for (const selector of [
    '.site-public .footer__tag',
    '.site-public .footer__col h2',
    '.site-public .footer__bottom .micro',
  ]) {
    assert.match(declarations(selector), /color:\s*var\(--zinc-600\)/u, selector);
  }
});

renderTest('hidden skip link cannot create RTL document overflow', () => {
  const hidden = declarations('.site-public .skip-link');
  const focused = declarations('.site-public .skip-link:focus');
  assert.doesNotMatch(hidden, /-9999px/u);
  assert.match(hidden, /transform:\s*translateY\(-150%\)/u);
  assert.match(focused, /transform:\s*translateY\(0\)/u);
});

renderTest('homepage hero image and two overlays remain exact and separate from modifiers', () => {
  const hero = declarations('.site-public .hero');
  assert.match(hero, /background-image:\s*url\('\/hero\/skyline\.jpg'\)/u);
  assert.match(hero, /background-repeat:\s*no-repeat/u);
  assert.match(hero, /background-size:\s*cover/u);
  assert.match(hero, /background-position:\s*right bottom/u);
  assert.match(hero, /background-color:\s*var\(--paper\)/u);
  assert.doesNotMatch(hero, /pro-firm-operations|knowledge-base/u);

  const overlay = declarations('.site-public .hero__overlay');
  assert.match(overlay, /linear-gradient\(\s*180deg,[\s\S]*transparent 55%\s*\)/u);
  assert.match(
    overlay,
    /linear-gradient\(\s*90deg,[\s\S]*var\(--paper\) 15%, transparent\) 100%\s*\)/u,
  );
  assert.equal((overlay.match(/linear-gradient\(/gu) ?? []).length, 2);
  assert.match(css, /\.site-public \.hero--pro\s*\{[^}]*pro-firm-operations/u);
});

renderTest('new public shell rules use logical direction properties', () => {
  const touchedSelectors = [
    '.site-public .public-theme-toggle',
    '.site-public .btn--accent',
    '.site-public .btn--accent:hover',
    ".site-public .btn--accent:disabled,\n.site-public .btn--accent[aria-disabled='true']",
  ];
  for (const selector of touchedSelectors) {
    assert.doesNotMatch(
      declarations(selector),
      /(?:^|;)\s*(?:left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/u,
      `${selector} adds a physical direction declaration`,
    );
  }
});

renderTest('public theme control is hydration-stable, localized, and light/dark only', () => {
  assert.match(toggle, /^'use client';/u);
  assert.match(toggle, /useTheme\(\)/u);
  assert.match(toggle, /resolvedTheme/u);
  assert.match(toggle, /themeUseLight/u);
  assert.match(toggle, /themeUseDark/u);
  assert.match(toggle, /className="public-theme-toggle"/u);
  assert.match(toggle, /aria-label=/u);
  assert.doesNotMatch(
    toggle,
    /aria-pressed=/u,
    'a next-action label must not also present toggle-state semantics',
  );
  assert.match(toggle, /useSyncExternalStore/u);
  assert.match(toggle, /getServerSnapshot/u);
  assert.match(toggle, /setTheme\(resolvedTheme === 'dark' \? 'light' : 'dark'\)/u);
  assert.doesNotMatch(toggle, /setTheme\([^)]*system/u);
  assert.doesNotMatch(toggle, /components\/admin\/ThemeToggle/u);
});
