import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { variantForPath } from './auth-experience-route';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof it) : it;

if (reactServer) {
  it('provider rendering contracts run under the client React export condition', () => {
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

const root = process.cwd();

function source(path: string): string {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

describe('reference-family authentication shell', () => {
  const experience = source('src/components/auth/AuthExperience.tsx');
  const routeVariants = source('src/components/auth/auth-experience-route.ts');
  const providers = source('src/components/auth/AuthProviders.tsx');
  const layout = source('src/app/(auth)/layout.tsx');
  const css = source('src/app/(public)/public-theme.css');

  it('keeps the accepted public chrome and one layout-owned main landmark', () => {
    assert.match(layout, /<SiteHeader\s*\/>/u);
    assert.match(layout, /<main\s+id="main"\s+tabIndex=\{-1\}/u);
    assert.match(layout, /<AuthExperience>[\s\S]*\{children\}[\s\S]*<\/AuthExperience>/u);
    assert.match(layout, /<SiteFooter\s*\/>/u);
    assert.equal(layout.match(/<main\b/gu)?.length, 1);
    assert.doesNotMatch(experience, /<main\b|<h1\b/u);
    assert.doesNotMatch(experience, /<aside\b/u);
    assert.match(
      experience,
      /<section className="auth-experience__narrative" aria-labelledby="auth-narrative-title">/u,
    );
    assert.ok(
      experience.indexOf('auth-experience__form-column') <
        experience.indexOf('auth-experience__narrative'),
      'route-owned H1 in the form card must precede narrative headings in DOM order',
    );
  });

  it('builds the two-column stage from a local skyline and four benefits', () => {
    assert.match(experience, /className="auth-experience__stage"/u);
    assert.match(experience, /className="auth-experience__narrative"/u);
    assert.match(experience, /className="auth-experience__card"/u);
    assert.match(experience, /src="\/hero\/skyline\.webp"/u);
    assert.match(experience, /privacyNote/u);
    assert.match(experience, /icons\.map/u);
  });

  it('supports login, register, and shorter sensitive-flow variants', () => {
    assert.match(routeVariants, /'login'\s*\|\s*'register'\s*\|\s*'sensitive'/u);
    assert.match(routeVariants, /sensitivePaths/u);
    assert.match(experience, /auth-experience--\$\{resolvedVariant\}/u);
    assert.doesNotMatch(experience, /<AuthProviders/u);
    assert.doesNotMatch(experience, /return null/u);
  });

  it('classifies auth routes without unsafe prefix collisions', () => {
    const cases = [
      ['/login', 'login'],
      ['/signin', 'login'],
      ['/register', 'register'],
      ['/register/pro', 'register'],
      ['/forgot-password', 'sensitive'],
      ['/reset-password', 'sensitive'],
      ['/verify-otp', 'sensitive'],
      ['/invite/token-value', 'sensitive'],
      ['/mfa/challenge', 'sensitive'],
      ['/mfa/enroll', 'sensitive'],
      ['/registering', 'login'],
      ['/invited', 'login'],
      ['/forgot-password-old', 'login'],
      ['/reset-password-help', 'login'],
      ['/verify-otpfoo', 'login'],
    ] as const;

    for (const [path, expected] of cases) {
      assert.equal(variantForPath(path), expected, path);
    }
  });

  it('renders the complete four-item support strip after the stage', () => {
    assert.match(experience, /className="auth-support"/u);
    assert.match(experience, /supportItems\.map/u);
    assert.ok(
      experience.indexOf('auth-experience__stage') < experience.indexOf('auth-support'),
      'support strip must follow the stage',
    );
  });

  it('keeps unsupported providers visible but non-interactive', () => {
    for (const provider of ['google', 'microsoft', 'apple']) {
      assert.match(providers, new RegExp(`id: '${provider}'`, 'u'));
    }
    assert.match(providers, /role="status"/u);
    assert.match(providers, /aria-disabled="true"/u);
    assert.match(providers, /AuthProviderLabels/u);
    assert.doesNotMatch(providers, /<button|<a\b|<form\b/u);
  });

  renderTest('renders three unavailable providers with no focusable controls', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { AuthProviders } = await import('./AuthProviders');
    const messages = (await import('@/messages/en.json')).default;
    const p = messages.auth.providers;
    const markup = renderToStaticMarkup(
      React.createElement(AuthProviders, {
        labels: {
          ...p,
          providerUnavailableLabel: (provider: string) => `${provider} sign-in unavailable`,
        },
      }),
    );
    assert.equal((markup.match(/aria-disabled="true"/gu) ?? []).length, 3);
    assert.equal((markup.match(/role="group"/gu) ?? []).length, 3);
    assert.doesNotMatch(markup, /<(?:button|a|form|input)\b/u);
  });

  it('uses public semantic tokens with desktop, dark, focus, and reduced-motion rules', () => {
    assert.match(css, /\.site-public \.auth-experience__stage\s*\{/u);
    assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(420px,\s*0\.92fr\)/u);
    assert.match(
      css,
      /\.site-public \.auth-experience__card\s*\{[\s\S]*?var\(--public-surface-elevated\)/u,
    );
    assert.match(css, /\.dark \.site-public \.auth-experience/u);
    assert.match(css, /\.site-public \.auth-provider\[aria-disabled='true'\]/u);
    assert.doesNotMatch(css, /\.site-public \.auth-provider:focus-visible/u);
    assert.match(
      css,
      /\.site-public \.btn--accent-outline\s*\{[^}]*color:\s*var\(--public-cta-background\)/u,
    );
    assert.match(
      css,
      /button\[role='checkbox'\]\s*\{[\s\S]*?inline-size:\s*24px;[\s\S]*?block-size:\s*24px;/u,
    );
    assert.match(css, /button\[role='checkbox'\]::after\s*\{[\s\S]*?inset:\s*0/u);
    assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/u);
  });
});
