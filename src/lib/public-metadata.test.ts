import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildAuthMetadata,
  buildPublicMetadata,
  buildUnavailableMetadata,
  PUBLIC_SITE_ORIGIN,
} from './public-metadata';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('public metadata policy', () => {
  it('uses the stable public origin and normalized absolute canonicals', () => {
    assert.equal(PUBLIC_SITE_ORIGIN.href, 'https://mandoob.ae/');
    const metadata = buildPublicMetadata({
      title: 'About Mandoob',
      description: 'How Mandoob supports UAE Companies and verified PROs.',
      canonical: '/about?ignored=true',
    });
    assert.deepEqual(metadata.alternates, { canonical: '/about' });
    assert.equal(metadata.robots, undefined);
  });

  it('marks auth and synthetic unavailable states noindex and nofollow', () => {
    for (const metadata of [
      buildAuthMetadata({
        title: 'Sign in',
        description: 'Access your account.',
        canonical: '/login',
      }),
      buildUnavailableMetadata({
        title: 'Content unavailable',
        description: 'This content cannot be loaded right now.',
        canonical: '/blog/example',
      }),
    ]) {
      assert.deepEqual(metadata.robots, { index: false, follow: false });
    }
  });

  it('wires metadataBase, homepage metadata, private application metadata, and robots policy', () => {
    const layout = read('src/app/layout.tsx');
    const home = read('src/app/(public)/page.tsx');
    const apply = read('src/app/(public)/apply/page.tsx');
    const robots = read('src/app/robots.ts');
    assert.match(layout, /metadataBase:\s*PUBLIC_SITE_ORIGIN/u);
    assert.match(home, /buildPublicMetadata/u);
    assert.match(home, /canonical:\s*'\/'/u);
    assert.match(apply, /buildAuthMetadata/u);
    assert.match(apply, /canonical:\s*'\/apply'/u);
    assert.match(robots, /disallow:\s*\['\/api\/'\]/u);
  });

  it('gives every auth route an explicit canonical noindex policy', () => {
    const policies = [
      ['login/page.tsx', '/login'],
      ['signin/page.tsx', '/login'],
      ['register/page.tsx', '/register'],
      ['register/pro/page.tsx', '/register/pro'],
      ['forgot-password/page.tsx', '/forgot-password'],
      ['reset-password/page.tsx', '/reset-password'],
      ['verify-otp/page.tsx', '/verify-otp'],
      ['invite/[token]/page.tsx', '/invite'],
      ['mfa/enroll/page.tsx', '/mfa/enroll'],
      ['mfa/challenge/page.tsx', '/mfa/challenge'],
    ] as const;
    for (const [route, canonical] of policies) {
      const source = read(`src/app/(auth)/${route}`);
      assert.match(source, /buildAuthMetadata/u, route);
      assert.match(
        source,
        new RegExp(`canonical:\\s*'${canonical.replaceAll('/', '\\/')}'`, 'u'),
        route,
      );
    }
  });

  it('marks dynamic synthetic unavailable content noindex', () => {
    for (const route of [
      'src/app/(public)/blog/page.tsx',
      'src/app/(public)/blog/[slug]/page.tsx',
      'src/app/(public)/legal/[slug]/page.tsx',
      'src/app/(public)/[slug]/page.tsx',
    ]) {
      assert.match(read(route), /buildUnavailableMetadata/u, route);
    }
  });

  it('provides safe shared public and auth error boundaries', () => {
    const component = read('src/components/public-content/PublicRouteError.tsx');
    assert.match(component, /^'use client';/u);
    assert.match(component, /reset\(\)/u);
    assert.match(component, /publicPolish\.error/u);
    assert.doesNotMatch(component, /error\.(?:message|stack|digest)/u);
    for (const boundary of ['src/app/(public)/error.tsx', 'src/app/(auth)/error.tsx']) {
      const source = read(boundary);
      assert.match(source, /^'use client';/u, boundary);
      assert.match(source, /PublicRouteError/u, boundary);
    }
  });
});
