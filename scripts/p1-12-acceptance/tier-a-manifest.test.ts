import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  P112_TIER_A_CLIENT_JOURNEYS,
  P112_TIER_A_ROUTES,
  P112_TIER_A_STATE_BY_ROUTE,
  P112_FROZEN_STATE_OWNERSHIP,
  P112_REQUIRED_SITEMAP_PATHS,
  P112_TIER_A_RENDERED_CASES,
  P112_EVIDENCE_PROFILE_ENV,
  P112_PAGE_QUERIES_BY_STATE,
  P112_UNREACHABLE_RENDERED_STATES,
  tierAExecutionCount,
} from './tier-a-manifest';

test('freezes each concrete Tier A route once', () => {
  assert.equal(P112_TIER_A_ROUTES.length, 35);
  assert.equal(new Set(P112_TIER_A_ROUTES.map(({ id }) => id)).size, 35);
  assert.ok(P112_TIER_A_ROUTES.every(({ path }) => path.startsWith('/') && !path.includes('[')));
  assert.deepEqual(
    P112_TIER_A_ROUTES.filter(({ kind }) => kind === 'generated').map(({ path }) => path),
    ['/robots.txt', '/sitemap.xml'],
  );
});

test('retains ready fixtures, true-missing routes, and invalid auth contexts', () => {
  for (const path of [
    '/blog/p1-12-public-fixture',
    '/blog/p1-12-missing',
    '/company-setup/p1-12-missing',
    '/knowledge-base/p1-12-missing',
    '/invite/p1-12-invalid',
    '/verify-otp',
    '/reset-password',
  ]) {
    assert.ok(
      P112_TIER_A_ROUTES.some((route) => route.path === path),
      path,
    );
  }
});

test('uses the stable semantic heading for the streamed blog not-found state', () => {
  const missingBlog = P112_TIER_A_RENDERED_CASES.find(({ id }) => id === 'blog-missing');
  assert.deepEqual(missingBlog?.sections, ['main h1']);
});

test('makes SEO, document, and structured-data expectations explicit', () => {
  for (const route of P112_TIER_A_ROUTES.filter(({ kind }) => kind === 'html')) {
    assert.ok(route.canonical === null || /^\//u.test(route.canonical));
    assert.equal(typeof route.noindex, 'boolean');
    assert.equal(typeof route.requiresMainHeading, 'boolean');
    assert.ok(Number.isInteger(route.jsonLdCount) && route.jsonLdCount >= 0);
    assert.equal(route.jsonLdTypes.length, route.jsonLdCount);
    assert.ok(route.expectedStatus === 200 || route.expectedStatus === 404);
    const destinations = (route as unknown as { enabledDestinations?: readonly string[] })
      .enabledDestinations;
    assert.ok(destinations && destinations.length > 0, `${route.id} destination declaration`);
    assert.equal(new Set(destinations).size, destinations.length, route.id);
    assert.ok(
      destinations.every((destination) => destination.startsWith('/')),
      route.id,
    );
    assert.ok(
      destinations.some(
        (destination) =>
          new URL(destination, 'http://127.0.0.1:3001').pathname ===
          new URL(route.path, 'http://127.0.0.1:3001').pathname,
      ),
      `${route.id} current/recovery destination`,
    );
  }
  assert.equal(P112_TIER_A_ROUTES.find(({ id }) => id === 'blog-ready')?.noindex, true);
});

test('assigns every route and real client journey an exact frozen browser state', () => {
  assert.deepEqual(
    Object.keys(P112_TIER_A_STATE_BY_ROUTE).sort(),
    P112_TIER_A_ROUTES.map(({ id }) => id).sort(),
  );
  assert.ok(Object.values(P112_TIER_A_STATE_BY_ROUTE).every((id) => /^S\d{3}$/u.test(id)));
  assert.deepEqual(
    P112_TIER_A_CLIENT_JOURNEYS.map(({ stateId }) => stateId),
    ['S002', 'S003', 'S008'],
  );
  assert.ok(
    P112_TIER_A_CLIENT_JOURNEYS.every(({ from, to }) => from.startsWith('/') && to.startsWith('/')),
  );
  const estimatorHandoff = P112_TIER_A_CLIENT_JOURNEYS.find(
    ({ id }) => id === 'mainland-estimate-context',
  );
  assert.equal(estimatorHandoff?.to, '/estimate?jurisdiction=mainland');
  assert.equal(estimatorHandoff?.consumedContext, undefined);
  assert.deepEqual(
    [...(P112_PAGE_QUERIES_BY_STATE.get('S008')?.get('/estimate') ?? [])].sort(),
    [
      '',
      '?jurisdiction=mainland',
      '?jurisdiction=mainland&emirate=abu_dhabi',
      '?jurisdiction=mainland&emirate=ajman',
      '?jurisdiction=mainland&emirate=dubai',
      '?jurisdiction=mainland&emirate=fujairah',
      '?jurisdiction=mainland&emirate=ras_al_khaimah',
      '?jurisdiction=mainland&emirate=sharjah',
      '?jurisdiction=mainland&emirate=umm_al_quwain',
    ].sort(),
  );
  assert.deepEqual([...(P112_PAGE_QUERIES_BY_STATE.get('S009')?.get('/estimate') ?? [])].sort(), [
    '',
    '?jurisdiction=free_zone',
  ]);
  assert.deepEqual([...(P112_PAGE_QUERIES_BY_STATE.get('S013')?.get('/estimate') ?? [])].sort(), [
    '',
    '?jurisdiction=offshore',
  ]);
  assert.deepEqual([...(P112_PAGE_QUERIES_BY_STATE.get('S014')?.get('/estimate') ?? [])].sort(), [
    '',
    '?jurisdiction=free_zone&authority=DMCC&emirate=dubai',
  ]);
  assert.deepEqual(
    [...(P112_PAGE_QUERIES_BY_STATE.get('S031')?.get('/knowledge-base') ?? [])].sort(),
    [
      '',
      '?q=Free+zones',
      '?q=Documents',
      '?q=Visas',
      '?q=Costs',
      '?category=company-setup',
      '?category=jurisdictions',
      '?category=documents',
      '?category=timelines',
      '?category=visas',
      '?category=costs',
      '?category=compliance',
    ].sort(),
  );
  assert.deepEqual(
    [...(P112_PAGE_QUERIES_BY_STATE.get('S033')?.get('/knowledge-base') ?? [])]
      .filter((query) => query.includes('p1-12-no-match'))
      .sort(),
    [
      '?q=p1-12-no-match',
      '?q=p1-12-no-match&category=company-setup',
      '?q=p1-12-no-match&category=jurisdictions',
      '?q=p1-12-no-match&category=documents',
      '?q=p1-12-no-match&category=timelines',
      '?q=p1-12-no-match&category=visas',
      '?q=p1-12-no-match&category=costs',
      '?q=p1-12-no-match&category=compliance',
    ].sort(),
  );
});

test('calculates four required desktop executions per concrete route', () => {
  assert.equal(tierAExecutionCount(), P112_TIER_A_RENDERED_CASES.length * 4 + 12);
});

test('adds every reachable direct-render fixture state', () => {
  const states = new Set(P112_TIER_A_RENDERED_CASES.map(({ stateId }) => stateId));
  for (const stateId of [
    'S015',
    'S025',
    'S026',
    'S027',
    'S029',
    'S033',
    'S039',
    'S040',
    'S056',
    'S134',
    'S135',
  ]) {
    assert.ok(
      states.has(stateId) ||
        (P112_UNREACHABLE_RENDERED_STATES as readonly string[]).includes(stateId),
      stateId,
    );
  }
  assert.deepEqual(P112_UNREACHABLE_RENDERED_STATES, []);
  const authorityUnavailable = P112_TIER_A_RENDERED_CASES.find(({ stateId }) => stateId === 'S015');
  assert.equal(authorityUnavailable?.path, '/company-setup/dmcc');
  assert.equal(authorityUnavailable?.profile, 'authority-source-unavailable');
  assert.equal(authorityUnavailable?.canonical, '/company-setup/dmcc');
  assert.equal(authorityUnavailable?.expectedStatus, 200);
  assert.equal(authorityUnavailable?.noindex, true);
  assert.equal(authorityUnavailable?.jsonLdCount, 0);
  assert.equal(authorityUnavailable?.og, 'prohibited');
  assert.deepEqual(authorityUnavailable?.sections, ['.public-content-state']);
  assert.ok(P112_TIER_A_RENDERED_CASES.every(({ profile }) => profile.length > 0));
  assert.deepEqual(
    [...new Set(P112_TIER_A_RENDERED_CASES.map(({ profile }) => profile))].sort(),
    Object.keys(P112_EVIDENCE_PROFILE_ENV).sort(),
  );
});

test('declares only the deliberate conversion-band and editorial-paper theme exemptions', () => {
  for (const id of ['about', 'contact', 'pricing', 'pro']) {
    assert.deepEqual(P112_TIER_A_ROUTES.find((route) => route.id === id)?.themeSurfaceExemptions, [
      '.about-contact-conversion',
    ]);
  }
  assert.deepEqual(
    P112_TIER_A_ROUTES.find((route) => route.id === 'home')?.themeSurfaceExemptions,
    [],
  );
  assert.deepEqual(
    P112_TIER_A_ROUTES.find((route) => route.id === 'blog-index')?.themeSurfaceExemptions,
    ['.blog-hero'],
  );
});

test('freezes exact metadata, OG policy, and section identity/order for every HTML rendered case', () => {
  for (const route of P112_TIER_A_RENDERED_CASES.filter(({ kind }) => kind === 'html')) {
    assert.ok(route.expectedTitle.length > 0, route.id);
    assert.ok(route.expectedDescription.length > 0, route.id);
    assert.ok(route.og === 'required' || route.og === 'prohibited', route.id);
    assert.ok(route.sections.length > 0, route.id);
    assert.ok(Array.isArray(route.themeSurfaceExemptions), route.id);
    assert.equal(new Set(route.sections).size, route.sections.length, route.id);
    assert.ok(
      route.enabledDestinations.some(
        (destination) =>
          new URL(destination, 'http://127.0.0.1:3001').pathname ===
          new URL(route.path, 'http://127.0.0.1:3001').pathname,
      ),
      `${route.stateId}:${route.id} current/recovery destination`,
    );
  }
  for (const id of ['blog-ready', 'knowledge-base-ready']) {
    assert.deepEqual(P112_TIER_A_ROUTES.find((route) => route.id === id)?.sections, [
      id === 'blog-ready' ? '.blog-editorial-hero' : '.kb-editorial-hero',
      'section[aria-label="Article body"]',
    ]);
  }
  const titlePairs = P112_TIER_A_RENDERED_CASES.filter(
    ({ expectedStatus, kind }) => expectedStatus === 200 && kind === 'html',
  ).map(({ id, expectedTitle }) => `${id}:${expectedTitle}`);
  assert.equal(new Set(titlePairs).size, titlePairs.length);
});

test('freezes complete pricing and auth structural regions', () => {
  assert.deepEqual(P112_TIER_A_ROUTES.find(({ id }) => id === 'pricing')?.sections, [
    '.pricing-hero',
    '.pricing-tiers',
    '.pricing-comparison',
    '.pricing-costs',
    '.pricing-access',
    '.pricing-faq',
    '.about-contact-conversion',
  ]);
  for (const id of [
    'login',
    'register',
    'register-pro',
    'invite-invalid',
    'verify-otp-missing-context',
    'forgot-password',
    'reset-password-missing-context',
    'mfa-enroll-unauthenticated',
    'mfa-challenge-missing-factor',
  ]) {
    assert.deepEqual(P112_TIER_A_ROUTES.find((route) => route.id === id)?.sections, [
      '.auth-experience__stage',
      '.auth-experience__narrative',
      '.auth-support',
    ]);
  }
});

test('freezes the complete PRO section order', () => {
  assert.deepEqual(P112_TIER_A_ROUTES.find(({ id }) => id === 'pro')?.sections, [
    '.hero--pro',
    '#pro-fit',
    '#pro-capabilities',
    '#pro-operating-process',
    '#dashboard',
    '.pro-bento',
    '#pro-benefits-packages',
    '#pro-faq',
    '.about-contact-conversion',
  ]);
});

test('assigns all 146 frozen states to an exact executable or source-regression owner', () => {
  assert.equal(P112_FROZEN_STATE_OWNERSHIP.length, 146);
  assert.deepEqual(
    P112_FROZEN_STATE_OWNERSHIP.map(({ stateId }) => stateId),
    Array.from({ length: 146 }, (_, index) => `S${String(index + 1).padStart(3, '0')}`),
  );
  assert.ok(
    P112_FROZEN_STATE_OWNERSHIP.every(
      ({ path, condition, proof, orchestration }) =>
        path.startsWith('/') &&
        condition.length > 0 &&
        proof.includes('.ts#') &&
        orchestration === `${orchestration.slice(0, 4)}: ${condition}`,
    ),
  );
  assert.equal(new Set(P112_FROZEN_STATE_OWNERSHIP.map(({ proof }) => proof)).size, 146);
  assert.ok(
    P112_FROZEN_STATE_OWNERSHIP.every(
      ({ execution }) =>
        execution === 'tier-a-route' ||
        execution === 'tier-c-browser' ||
        execution === 'source-regression',
    ),
  );
  assert.deepEqual(
    P112_FROZEN_STATE_OWNERSHIP.filter(({ execution }) => execution === 'tier-c-browser').map(
      ({ stateId }) => stateId,
    ),
    [
      'S011',
      'S019',
      'S021',
      'S052',
      'S061',
      'S063',
      'S073',
      'S077',
      'S079',
      'S081',
      'S086',
      'S128',
      'S138',
      'S142',
    ],
  );
  const tierAStateIds = new Set([
    ...P112_TIER_A_RENDERED_CASES.map(({ stateId }) => stateId),
    ...P112_TIER_A_CLIENT_JOURNEYS.map(({ stateId }) => stateId),
  ]);
  assert.deepEqual(
    P112_FROZEN_STATE_OWNERSHIP.filter(({ execution }) => execution === 'tier-a-route').map(
      ({ stateId }) => stateId,
    ),
    [...tierAStateIds].sort(),
  );
});

test('freezes exact sitemap inclusion without fixture, auth, private, or missing paths', () => {
  assert.deepEqual(P112_REQUIRED_SITEMAP_PATHS.slice(0, 11), [
    '/',
    '/estimate',
    '/pricing',
    '/pro',
    '/knowledge-base',
    '/blog',
    '/mainland',
    '/free-zones',
    '/offshore',
    '/about',
    '/contact',
  ]);
  for (const forbidden of [
    '/apply',
    '/login',
    '/register',
    '/p1-12-missing',
    '/blog/p1-12-public-fixture',
  ]) {
    assert.equal(P112_REQUIRED_SITEMAP_PATHS.includes(forbidden), false);
  }
  assert.equal(new Set(P112_REQUIRED_SITEMAP_PATHS).size, P112_REQUIRED_SITEMAP_PATHS.length);
});
