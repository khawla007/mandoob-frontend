import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  classifyP112BrowserRequest,
  findPrivacyLeak,
  dispositionP112AxeFindings,
  isExpectedP112RequestFailure,
  isExpectedP112RouteErrorConsole,
  isP112ExpectedClientNavigationAbort,
  isExpectedP112MissingDocumentConsole,
  normalizeP112Request,
  parseP112RobotsDirective,
  parseP112RobotsMetadata,
  resolveP112Redirect,
  p112DestinationProbeStrategy,
  isP112LocalNextStaticPath,
} from './browser-contract';

test('accepts only a redundant allowed RSC abort for the exact client-navigation target', () => {
  const base = {
    method: 'GET',
    url: 'http://127.0.0.1:3001/legal/privacy?_rsc=frozen1',
    stateId: 'S003',
    evidenceProfile: 'production',
    resourceType: 'fetch',
    allowed: true,
    failure: 'net::ERR_ABORTED',
    targetPath: '/legal/privacy',
  } as const;
  assert.equal(isP112ExpectedClientNavigationAbort(base), true);
  assert.equal(isP112ExpectedClientNavigationAbort({ ...base, targetPath: '/legal/terms' }), false);
  assert.equal(isP112ExpectedClientNavigationAbort({ ...base, failure: 'net::ERR_FAILED' }), false);
  assert.equal(isP112ExpectedClientNavigationAbort({ ...base, allowed: false }), false);
  assert.equal(
    isP112ExpectedClientNavigationAbort({
      ...base,
      url: 'http://127.0.0.1:3001/legal/privacy?token=secret',
    }),
    false,
  );
  assert.equal(
    isP112ExpectedClientNavigationAbort({
      ...base,
      stateId: 'S008',
      url: 'http://127.0.0.1:3001/estimate?jurisdiction=mainland&_rsc=frozen1',
      targetPath: '/estimate?jurisdiction=mainland',
    }),
    true,
  );
  assert.equal(
    isP112ExpectedClientNavigationAbort({
      ...base,
      url: 'http://127.0.0.1:3001/legal/privacy?extra=1&_rsc=frozen1',
    }),
    false,
  );
});

test('classifies only the intentional S134 development error console', () => {
  const text =
    '%o\n\n%s Error: isolated development route error evidence\n    at DevelopmentRouteErrorEvidence';
  const url =
    'webpack-internal:///(app-pages-browser)/../../node_modules/next/dist/client/react-client-callbacks/error-boundary-callbacks.js';
  assert.equal(
    isExpectedP112RouteErrorConsole({ stateId: 'S134', evidenceProfile: 'route-error', text, url }),
    true,
  );
  assert.equal(
    isExpectedP112RouteErrorConsole({ stateId: 'S135', evidenceProfile: 'route-error', text, url }),
    false,
  );
  assert.equal(
    isExpectedP112RouteErrorConsole({ stateId: 'S134', evidenceProfile: 'production', text, url }),
    false,
  );
  assert.equal(
    isExpectedP112RouteErrorConsole({
      stateId: 'S134',
      evidenceProfile: 'route-error',
      text: 'Error: unexpected',
      url,
    }),
    false,
  );
});
import { P112_PAGE_PATHS_BY_STATE, P112_PAGE_QUERIES_BY_STATE } from './tier-a-manifest';

test('assigns backend-backed HTTP probes only to their owning state', () => {
  assert.equal(p112DestinationProbeStrategy('S136', '/blog'), 'http');
  assert.equal(p112DestinationProbeStrategy('S136', '/legal/privacy'), 'declaration');
  assert.equal(p112DestinationProbeStrategy('S024', '/blog/p1-12-public-fixture'), 'declaration');
  assert.equal(p112DestinationProbeStrategy('S028', '/blog/p1-12-public-fixture'), 'http');
  assert.equal(p112DestinationProbeStrategy('S038', '/legal/terms'), 'http');
  assert.equal(p112DestinationProbeStrategy('S007', '/mainland'), 'http');
});

test('accepts only an existing lazy Next static file below the bounded local root', () => {
  const root = mkdtempSync(join(tmpdir(), 'p112-next-static-'));
  mkdirSync(join(root, 'chunks'), { recursive: true });
  writeFileSync(join(root, 'chunks', 'lazy.js'), '');
  mkdirSync(join(root, 'chunks', 'app', '(public)', 'company-setup', '[authoritySlug]'), {
    recursive: true,
  });
  writeFileSync(
    join(root, 'chunks', 'app', '(public)', 'company-setup', '[authoritySlug]', 'page.js'),
    '',
  );
  const outside = join(mkdtempSync(join(tmpdir(), 'p112-next-outside-')), 'secret.js');
  writeFileSync(outside, '');
  symlinkSync(outside, join(root, 'chunks', 'escape.js'));
  assert.equal(isP112LocalNextStaticPath('/_next/static/chunks/lazy.js', root), true);
  assert.equal(
    isP112LocalNextStaticPath(
      '/_next/static/chunks/app/(public)/company-setup/%5BauthoritySlug%5D/page.js',
      root,
    ),
    true,
  );
  assert.equal(isP112LocalNextStaticPath('/_next/static/chunks/missing.js', root), false);
  assert.equal(isP112LocalNextStaticPath('/_next/static/%2E%2E/secret.js', root), false);
  assert.equal(isP112LocalNextStaticPath('/_next/static/chunks/escape.js', root), false);
  assert.equal(isP112LocalNextStaticPath('/_next/static/../server/secret.js', root), false);
  assert.equal(isP112LocalNextStaticPath('/arbitrary.js', root), false);
});

test('allows only bounded virtual Next static assets for development evidence profiles', () => {
  const classify = (profile: string, path: string) =>
    classifyP112BrowserRequest({
      method: 'GET',
      url: `http://127.0.0.1:3001${path}`,
      stateId: 'S025',
      evidenceProfile: profile,
    } as Parameters<typeof classifyP112BrowserRequest>[0] & { evidenceProfile: string }).allowed;

  assert.equal(classify('blog-empty', '/_next/static/css/app/layout.css?v=1789099381688'), true);
  assert.equal(
    classify('blog-empty', '/_next/static/chunks/app/(public)/blog/page.js?v=1789099381688'),
    true,
  );
  assert.equal(
    classify('blog-empty', '/_next/static/media/2d0e38ee70dd3e77-s.p.ttf?v=1789099381688'),
    true,
  );
  assert.equal(classify('blog-empty', '/_next/static/chunks/app/(public)/blog/page.js'), true);
  assert.equal(
    classify('blog-empty', '/_next/static/chunks/app/(public)/blog/%5Bslug%5D/page.js'),
    true,
  );
  assert.equal(
    classify('blog-empty', '/_next/static/webpack/fd62ce7f82917873.webpack.hot-update.json'),
    true,
  );
  assert.equal(
    classify('blog-empty', '/_next/static/webpack/webpack.ad2ec3c51614f26c.hot-update.js'),
    true,
  );
  assert.equal(classify('production', '/_next/static/css/app/layout.css?v=1789099381688'), false);
  assert.equal(classify('blog-empty', '/_next/static/css/app/layout.css?token=private'), false);
  assert.equal(classify('blog-empty', '/_next/static/../server/private.js?v=1789099381688'), false);
  assert.equal(classify('blog-empty', '/_next/static/private.json?v=1789099381688'), false);
});

test('allows only the exact Next development error support requests for S134', () => {
  const classify = (stateId: string, profile: string, method: string, path: string) =>
    classifyP112BrowserRequest({
      method,
      url: `http://127.0.0.1:3001${path}`,
      stateId,
      evidenceProfile: profile,
    }).allowed;

  assert.equal(classify('S134', 'route-error', 'GET', '/__nextjs_font/geist-latin.woff2'), true);
  assert.equal(classify('S134', 'route-error', 'POST', '/__nextjs_original-stack-frames'), true);
  assert.equal(classify('S135', 'route-retry', 'GET', '/__nextjs_font/geist-latin.woff2'), false);
  assert.equal(classify('S134', 'production', 'POST', '/__nextjs_original-stack-frames'), false);
  assert.equal(classify('S134', 'route-error', 'GET', '/__nextjs_original-stack-frames'), false);
});

test('allows only explicitly reviewed destinations for the owning rendered or client state', () => {
  const allowed = (stateId: string, path: string, method = 'GET') =>
    classifyP112BrowserRequest({
      method,
      url: `http://127.0.0.1:3001${path}`,
      stateId,
      allowedPagePathsByState: P112_PAGE_PATHS_BY_STATE,
      allowedPageQueriesByState: P112_PAGE_QUERIES_BY_STATE,
    }).allowed;

  assert.equal(allowed('S009', '/mainland'), true);
  assert.equal(allowed('S009', '/company-setup/dmcc'), true);
  assert.equal(allowed('S024', '/blog/p1-12-public-fixture'), true);
  assert.equal(allowed('S028', '/blog'), true);
  assert.equal(allowed('S031', '/knowledge-base/uae-company-setup-process'), true);
  assert.equal(allowed('S078', '/register'), true);
  assert.equal(allowed('S008', '/estimate?jurisdiction=mainland'), true);
  assert.equal(allowed('S007', '/?token=secret'), false);
  assert.equal(allowed('S008', '/estimate?jurisdiction=offshore'), false);
  assert.equal(allowed('S008', '/estimate?jurisdiction=mainland&token=secret'), false);

  assert.equal(allowed('S007', '/company-setup/dmcc'), false);
  assert.equal(allowed('S017', '/blog/p1-12-public-fixture'), false);
  assert.equal(allowed('S022', '/register'), false);
  assert.equal(allowed('S024', '/knowledge-base/uae-company-setup-process'), false);
  assert.equal(allowed('S009', '/company-setup/not-reviewed'), false);
  assert.equal(allowed('S009', '/mainland', 'POST'), false);

  const rsc = classifyP112BrowserRequest({
    method: 'GET',
    url: 'http://127.0.0.1:3001/estimate?jurisdiction=mainland&_rsc=frozen1',
    stateId: 'S008',
    allowedPagePathsByState: P112_PAGE_PATHS_BY_STATE,
    allowedPageQueriesByState: P112_PAGE_QUERIES_BY_STATE,
  });
  assert.deepEqual(
    { allowed: rsc.allowed, queryShape: rsc.queryShape },
    {
      allowed: true,
      queryShape: 'next-rsc',
    },
  );

  const metadataIcon = classifyP112BrowserRequest({
    method: 'GET',
    url: 'http://127.0.0.1:3001/favicon.ico?603d046c9a6fdfbb',
    stateId: 'S007',
  });
  assert.deepEqual(
    { allowed: metadataIcon.allowed, queryShape: metadataIcon.queryShape },
    { allowed: true, queryShape: 'next-metadata-hash' },
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:3001/favicon.ico?token=secret',
      stateId: 'S007',
      reviewedStaticPaths: new Set(['/favicon.ico']),
    }).allowed,
    false,
  );
});

test('default-denies browser requests by exact origin, method, path, and state', () => {
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:3001/about',
      stateId: 'S017',
      allowedPagePathsByState: new Map([['S017', new Set(['/about'])]]),
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:3001/about',
      stateId: 'S017',
      allowedPagePathsByState: new Map([['S017', new Set(['/about'])]]),
      allowedPageQueriesByState: new Map(),
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'POST',
      url: 'http://127.0.0.1:3001/about',
      stateId: 'S017',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:56321/auth/v1/user',
      stateId: 'S145',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:56321/rest/v1/profiles',
      stateId: 'S145',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'DELETE',
      url: 'http://127.0.0.1:56321/auth/v1/factors/not-runtime-owned',
      stateId: 'S143',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'POST',
      url: 'http://127.0.0.1:3001/api/v1/auth/login',
      stateId: 'S078',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'POST',
      url: 'http://127.0.0.1:3001/api/v1/auth/login',
      stateId: 'S017',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({ method: 'GET', url: 'https://mandoob.ae/about', stateId: 'S017' })
      .allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:3001/admin',
      stateId: 'S017',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:3001/about',
      stateId: 'not-a-frozen-state',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:3001/hero/skyline.webp',
      stateId: 'S017',
      reviewedStaticPaths: new Set(['/hero/skyline.webp']),
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:3001/hero/unreviewed.webp',
      stateId: 'S017',
      reviewedStaticPaths: new Set(['/hero/skyline.webp']),
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'http://127.0.0.1:3001/about',
      stateId: 'S022',
      allowedPagePathsByState: new Map([['S022', new Set(['/pricing'])]]),
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112BrowserRequest({
      method: 'GET',
      url: 'data:image/png;base64,AA==',
      stateId: 'S017',
    }).allowed,
    true,
  );
});

test('allows only the exact refresh-token query shape', () => {
  const exact = {
    method: 'POST',
    url: 'http://127.0.0.1:56321/auth/v1/token?grant_type=refresh_token',
    stateId: 'S131',
  };
  assert.equal(classifyP112BrowserRequest(exact).allowed, true);
  assert.equal(
    classifyP112BrowserRequest({ ...exact, url: `${exact.url}&redirect=https://remote.invalid` })
      .allowed,
    false,
  );
});

test('normalizes request evidence without query, headers, bodies, or identifiers', () => {
  assert.deepEqual(
    normalizeP112Request('POST', 'http://127.0.0.1:3001/login?token=secret', 'S078'),
    {
      method: 'POST',
      origin: 'http://127.0.0.1:3001',
      path: '/login',
      stateId: 'S078',
      queryShape: 'unreviewed',
    },
  );
  assert.equal(
    normalizeP112Request('GET', 'http://127.0.0.1:3001/invite/runtime-secret-value', 'S098').path,
    '/invite/:runtime-token',
  );
  assert.equal(
    normalizeP112Request(
      'DELETE',
      'http://127.0.0.1:56321/auth/v1/factors/11200000-0000-4000-8000-000000000099',
      'S143',
    ).path,
    '/auth/v1/factors/:runtime-factor-id',
  );
});

test('permits only the tagged S100 fixture-owned invite transport failure', () => {
  const exact = {
    method: 'POST',
    url: 'http://127.0.0.1:3001/api/v1/auth/invite/accept',
    stateId: 'S100',
    fixtureFailureTag: 'expected_fixture_failure:S100:invite-source-unavailable',
  };
  assert.equal(isExpectedP112RequestFailure(exact), true);
  assert.equal(isExpectedP112RequestFailure({ ...exact, stateId: 'S099' }), false);
  assert.equal(isExpectedP112RequestFailure({ ...exact, method: 'GET' }), false);
  assert.equal(
    isExpectedP112RequestFailure({ ...exact, url: 'http://127.0.0.1:3001/api/v1/auth/login' }),
    false,
  );
});

test('detects retained credential-shaped values without flagging public fixture copy', () => {
  assert.equal(findPrivacyLeak('Public setup guidance for p1-12-public-fixture'), null);
  assert.equal(findPrivacyLeak('access_token=secret'), 'credential parameter');
  assert.equal(
    findPrivacyLeak('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnopqrstuvwxyz012345'),
    'JWT-shaped value',
  );
  assert.equal(findPrivacyLeak('person@example.test'), 'email address');
  assert.equal(findPrivacyLeak('/home/private/project/.env.local'), 'private filesystem path');
  assert.equal(findPrivacyLeak('postgres connection refused'), 'internal provider detail');
  assert.equal(findPrivacyLeak('Guaranteed government approval'), 'unsupported guarantee');
  assert.equal(findPrivacyLeak('otpauth://totp/Mandoob?secret=ABC123'), 'MFA secret material');
  assert.equal(findPrivacyLeak('+971 4 555 0123'), null);
  assert.equal(findPrivacyLeak('tel:+97145550123'), null);
  assert.equal(findPrivacyLeak('tel:+971501234567'), 'phone number');
  assert.equal(findPrivacyLeak('Call +971 50 123 4567'), 'phone number');
  assert.equal(findPrivacyLeak('passport-copy.pdf'), 'private document name');
  assert.equal(
    findPrivacyLeak('https://local.invalid/reset?token=raw-value'),
    'secret URL parameter',
  );
  assert.equal(findPrivacyLeak('11200000-0000-4000-8000-000000000099'), 'internal identifier');
  assert.equal(findPrivacyLeak('Only AED 12,500 guaranteed'), 'unsupported price claim');
  assert.equal(findPrivacyLeak('Your licence is approved in 3 days'), 'unsupported timeline claim');
  assert.equal(
    findPrivacyLeak('Rated five stars by 500 customers'),
    'unsupported testimonial claim',
  );
  assert.equal(findPrivacyLeak('Official government partner'), 'unsupported partnership claim');
  assert.equal(findPrivacyLeak('ISO 27001 certified'), 'unsupported certification claim');
  assert.equal(findPrivacyLeak('Office at 22 Sheikh Zayed Road'), 'unsupported street address');
  assert.equal(findPrivacyLeak('Indicative AED costs vary by authority.'), null);
  assert.equal(findPrivacyLeak('Timelines must be confirmed with the authority.'), null);
});

test('detects a sensitive token query containing the published tel-format phone', () => {
  assert.equal(findPrivacyLeak('?token=+97145550123'), 'secret URL parameter');
});

test('detects a sensitive code query containing the published display phone', () => {
  assert.equal(findPrivacyLeak('?code=+971 4 555 0123'), 'secret URL parameter');
});

test('requires explicit exact index/follow robot pairs', () => {
  assert.deepEqual(parseP112RobotsDirective('index, follow'), { index: true, follow: true });
  assert.deepEqual(parseP112RobotsDirective('NOINDEX, NOFOLLOW'), {
    index: false,
    follow: false,
  });
  assert.throws(() => parseP112RobotsDirective('index'), /exact pair/u);
  assert.throws(() => parseP112RobotsDirective('index, nofollow'), /contradictory/u);
  assert.throws(() => parseP112RobotsDirective('index, follow, noarchive'), /unsupported/u);
});

test('accepts only the exact Next.js not-found robots duplication', () => {
  assert.deepEqual(parseP112RobotsMetadata([], false), { index: true, follow: true });
  assert.deepEqual(parseP112RobotsMetadata(['noindex, nofollow'], false), {
    index: false,
    follow: false,
  });
  assert.deepEqual(parseP112RobotsMetadata(['noindex', 'noindex, nofollow'], true), {
    index: false,
    follow: false,
  });
  assert.throws(
    () => parseP112RobotsMetadata(['noindex', 'noindex, nofollow'], false),
    /metadata count/u,
  );
  assert.throws(
    () => parseP112RobotsMetadata(['noindex', 'index, follow'], true),
    /not-found pair/u,
  );
});

test('classifies only the browser-owned console signal for the expected missing document', () => {
  const text = 'Failed to load resource: the server responded with a status of 404 (Not Found)';
  assert.equal(
    isExpectedP112MissingDocumentConsole({
      text,
      url: 'http://127.0.0.1:3001/company-setup/p1-12-missing',
      routePath: '/company-setup/p1-12-missing',
      expectedStatus: 404,
    }),
    true,
  );
  assert.equal(
    isExpectedP112MissingDocumentConsole({
      text,
      url: 'http://127.0.0.1:3001/company-setup/p1-12-missing',
      routePath: '/company-setup/p1-12-missing',
      expectedStatus: 200,
    }),
    false,
  );
  assert.equal(
    isExpectedP112MissingDocumentConsole({
      text: 'Application failed with 404',
      url: 'http://127.0.0.1:3001/company-setup/p1-12-missing',
      routePath: '/company-setup/p1-12-missing',
      expectedStatus: 404,
    }),
    false,
  );
});

test('validates every redirect hop before any follow-up request', () => {
  assert.equal(
    resolveP112Redirect('/login', 'http://127.0.0.1:3001/signin'),
    'http://127.0.0.1:3001/login',
  );
  assert.throws(
    () => resolveP112Redirect('https://remote.invalid/steal', 'http://127.0.0.1:3001/login'),
    /origin rejected/u,
  );
  assert.throws(
    () => resolveP112Redirect('javascript:alert(1)', 'http://127.0.0.1:3001/login'),
    /origin rejected/u,
  );
});

test('deduplicates and explicitly dispositions every lower-severity axe finding', () => {
  const result = dispositionP112AxeFindings([
    { id: 'color-contrast', impact: 'moderate', nodes: [{ target: ['.cta'] }] },
    { id: 'color-contrast', impact: 'moderate', nodes: [{ target: ['.cta'] }] },
    { id: 'landmark', impact: 'minor', nodes: [{ target: ['footer'] }] },
  ]);
  assert.deepEqual(result, [
    { fingerprint: 'color-contrast|moderate|.cta', disposition: 'must-fix-before-acceptance' },
    { fingerprint: 'landmark|minor|footer', disposition: 'must-fix-before-acceptance' },
  ]);
});
