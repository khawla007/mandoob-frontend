import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  classifyP112ServerEgress,
  parseAndReconcileP112EgressLog,
  serverEgressNodeOptions,
} from './server-egress';
import {
  isP112BlockedNextDevelopmentVersionCheck,
  P112_SERVER_EGRESS_POLICY,
} from './server-egress-policy.mjs';

const BLOG_COLUMNS =
  'id,slug,title,excerpt,content_json,content_html,status,published_at,scheduled_for,meta_title,meta_description,canonical_url,noindex,featured_media_id,author_id,created_by,updated_by,deleted_at,created_at,updated_at';
const CMS_COLUMNS =
  'id,slug,title,content_json,content_html,hero_settings,background_image_media_id,status,published_at,scheduled_for,meta_title,meta_description,canonical_url,noindex,schema_markup,script_head,script_body_start,script_body_end,created_at,updated_at';
const NOW = '2026-09-09T00:00:00.000Z';

function query(entries: readonly (readonly [string, string])[]): string {
  return new URLSearchParams(entries.map(([name, value]) => [name, value])).toString();
}

const blogListQuery = query([
  ['select', BLOG_COLUMNS],
  ['status', 'eq.published'],
  ['deleted_at', 'is.null'],
  ['published_at', 'not.is.null'],
  ['published_at', `lte.${NOW}`],
  ['order', 'published_at.desc'],
]);
const blogDetailQuery = (slug: string) =>
  query([
    ['select', BLOG_COLUMNS],
    ['slug', `eq.${slug}`],
    ['status', 'eq.published'],
    ['deleted_at', 'is.null'],
    ['published_at', 'not.is.null'],
    ['published_at', `lte.${NOW}`],
  ]);
const cmsDetailQuery = (slug: string) =>
  query([
    ['select', CMS_COLUMNS],
    ['slug', `eq.${slug}`],
    ['status', 'eq.published'],
    ['deleted_at', 'is.null'],
    ['published_at', `lte.${NOW}`],
  ]);
const cmsListQuery = query([
  ['select', 'slug,updated_at,noindex'],
  ['status', 'eq.published'],
  ['deleted_at', 'is.null'],
  ['published_at', `lte.${NOW}`],
  ['order', 'updated_at.desc,slug.asc'],
]);

test('enumerates exact per-state operation and response-status tuples', () => {
  assert.ok(P112_SERVER_EGRESS_POLICY.length > 0);
  const keys = new Set<string>();
  for (const rule of P112_SERVER_EGRESS_POLICY) {
    const key = `${rule.profile}:${rule.stateId}:${rule.initiator}:${rule.category}:${rule.method}:${rule.path}`;
    assert.equal(keys.has(key), false, key);
    keys.add(key);
    assert.ok(rule.statuses.length > 0, key);
    assert.equal((rule.statuses as readonly unknown[]).includes('transport-failure'), false, key);
    assert.equal(
      rule.statuses.some((status) => typeof status === 'number' && status >= 500),
      false,
      key,
    );
    if ('queryShape' in rule || 'queryShapes' in rule) continue;
    const path =
      rule.path.replaceAll(/:[A-Za-z]+/gu, 'runtime-id') +
      (rule.path === '/auth/v1/token' ? '?grant_type=password' : '');
    const origin =
      rule.category === 'database' ? 'tcp://127.0.0.1:56322' : 'http://127.0.0.1:56321';
    assert.equal(
      classifyP112ServerEgress({
        stateId: rule.stateId,
        initiator: rule.initiator,
        profile: rule.profile,
        method: rule.method,
        url: `${origin}${path}`,
      }).allowed,
      true,
      key,
    );
  }
});

test('server egress permits only exact loopback HTTP and database endpoints', () => {
  const base = { profile: 'production', stateId: 'S127', initiator: 'app' } as const;
  assert.equal(
    classifyP112ServerEgress({ ...base, method: 'GET', url: 'http://127.0.0.1:56321/auth/v1/user' })
      .allowed,
    true,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      method: 'GET',
      url: 'http://127.0.0.1:56321/auth/v1/user?token=private',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      method: 'POST',
      url: 'http://127.0.0.1:56321/auth/v1/user',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      method: 'GET',
      url: 'http://127.0.0.1:56321/rest/v1/not-reviewed',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S136',
      method: 'GET',
      url: 'http://127.0.0.1:56321/rest/v1/blog_posts',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S136',
      method: 'GET',
      url: 'http://127.0.0.1:56321/rest/v1/blog_posts?select=*',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S136',
      method: 'GET',
      url: 'http://127.0.0.1:56321/rest/v1/cms_pages',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S136',
      method: 'POST',
      url: 'http://127.0.0.1:56321/rest/v1/blog_posts',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({ ...base, method: 'GET', url: 'https://example.com/' }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      profile: 'fixture',
      stateId: 'fixture-baseline',
      initiator: 'fixture',
      method: 'CONNECT',
      url: 'tcp://127.0.0.1:56322/postgres',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112ServerEgress({ ...base, method: 'CONNECT', url: 'tcp://127.0.0.1:56322/postgres' })
      .allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S088',
      method: 'POST',
      url: 'http://127.0.0.1:56321/auth/v1/admin/users',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S107',
      method: 'PUT',
      url: 'http://127.0.0.1:56321/auth/v1/admin/users/runtime-user',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S107',
      method: 'POST',
      url: 'http://127.0.0.1:56321/auth/v1/admin/users/runtime-user',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S139',
      method: 'POST',
      url: 'http://127.0.0.1:56321/auth/v1/factors/runtime-factor',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S139',
      method: 'PUT',
      url: 'http://127.0.0.1:56321/auth/v1/factors/runtime-factor',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S078',
      method: 'GET',
      url: 'http://127.0.0.1:56321/auth/v1/user',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S128',
      method: 'GET',
      url: 'http://127.0.0.1:56321/auth/v1/user',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S080',
      method: 'POST',
      url: 'http://127.0.0.1:56321/auth/v1/token?grant_type=password',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S080',
      method: 'POST',
      url: 'http://127.0.0.1:56321/auth/v1/token?grant_type=refresh_token',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S080',
      method: 'POST',
      url: 'http://127.0.0.1:56321/auth/v1/token?grant_type=password&extra=1',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S081',
      method: 'GET',
      url: 'http://127.0.0.1:56321/rest/v1/auth_failed_attempts?select=*&key=eq.acct%3Anobody%40example.com',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S081',
      method: 'GET',
      url: 'http://127.0.0.1:56321/rest/v1/auth_failed_attempts?select=*&key=eq.net%3A127.0.0.0%2F24',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S081',
      method: 'GET',
      url: 'http://127.0.0.1:56321/rest/v1/auth_failed_attempts?select=*&key=eq.unreviewed',
    }).allowed,
    false,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S081',
      method: 'POST',
      url: 'http://127.0.0.1:56321/rest/v1/auth_failed_attempts?on_conflict=key',
    }).allowed,
    true,
  );
  assert.equal(
    classifyP112ServerEgress({
      ...base,
      stateId: 'S081',
      method: 'POST',
      url: 'http://127.0.0.1:56321/rest/v1/auth_failed_attempts',
    }).allowed,
    false,
  );
});

test('recognizes only the exact Next development version check for local rejection', () => {
  const exact = 'https://registry.npmjs.org/-/package/next/dist-tags';
  assert.equal(isP112BlockedNextDevelopmentVersionCheck('GET', exact, 'development'), true);
  assert.equal(isP112BlockedNextDevelopmentVersionCheck('get', exact, 'development'), true);
  assert.equal(isP112BlockedNextDevelopmentVersionCheck('POST', exact, 'development'), false);
  assert.equal(
    isP112BlockedNextDevelopmentVersionCheck('GET', `${exact}?extra=1`, 'development'),
    false,
  );
  assert.equal(
    isP112BlockedNextDevelopmentVersionCheck(
      'GET',
      'https://registry.npmjs.org/-/package/react/dist-tags',
      'development',
    ),
    false,
  );
  assert.equal(isP112BlockedNextDevelopmentVersionCheck('GET', exact, 'production'), false);
});

test('matches exact ordered PostgREST query shapes for rendered and client-navigation states', () => {
  const classify = (stateId: string, profile: string, path: string, search: string) =>
    classifyP112ServerEgress({
      stateId,
      profile,
      initiator: 'app',
      method: 'GET',
      url: `http://127.0.0.1:56321${path}?${search}`,
    }).allowed;

  for (const [stateId, profile] of [
    ['S024', 'production'],
    ['S025', 'blog-empty'],
    ['S026', 'production'],
    ['S027', 'blog-unavailable'],
    ['S136', 'production'],
  ] as const)
    assert.equal(classify(stateId, profile, '/rest/v1/blog_posts', blogListQuery), true, stateId);
  assert.equal(
    classify('S028', 'production', '/rest/v1/blog_posts', blogDetailQuery('p1-12-public-fixture')),
    true,
  );
  assert.equal(
    classify(
      'S029',
      'blog-detail-unavailable',
      '/rest/v1/blog_posts',
      blogDetailQuery('p1-12-public-fixture'),
    ),
    true,
  );
  assert.equal(
    classify('S030', 'production', '/rest/v1/blog_posts', blogDetailQuery('p1-12-missing')),
    true,
  );
  for (const slug of ['privacy', 'terms', 'pdpl', 'trust']) {
    assert.equal(
      classify('S038', 'production', '/rest/v1/cms_pages', cmsDetailQuery(slug)),
      true,
      slug,
    );
    assert.equal(
      classify('S136', 'production', '/rest/v1/cms_pages', cmsDetailQuery(slug)),
      true,
      `build:${slug}`,
    );
  }
  assert.equal(
    classify('S003', 'production', '/rest/v1/cms_pages', cmsDetailQuery('privacy')),
    true,
  );
  assert.equal(
    classify(
      'S038',
      'route-retry',
      '/rest/v1/cms_pages',
      cmsDetailQuery('evidence-editorial-page'),
    ),
    true,
  );
  assert.equal(
    classify('S038', 'production', '/rest/v1/cms_pages', cmsDetailQuery('evidence-editorial-page')),
    false,
  );
  assert.equal(
    classify('S039', 'legal-unavailable', '/rest/v1/cms_pages', cmsDetailQuery('privacy')),
    true,
  );
  assert.equal(
    classify('S040', 'production', '/rest/v1/cms_pages', cmsDetailQuery('p1-12-missing')),
    true,
  );
  assert.equal(
    classify(
      'S134',
      'route-error',
      '/rest/v1/cms_pages',
      cmsDetailQuery('evidence-editorial-page'),
    ),
    true,
  );
  assert.equal(
    classify(
      'S135',
      'route-retry',
      '/rest/v1/cms_pages',
      cmsDetailQuery('evidence-editorial-page'),
    ),
    true,
  );
  assert.equal(classify('S136', 'production', '/rest/v1/cms_pages', cmsListQuery), true);

  const blogEntries = [...new URLSearchParams(blogListQuery).entries()];
  assert.equal(
    classify('S024', 'production', '/rest/v1/blog_posts', query(blogEntries.slice(0, -1))),
    false,
    'missing',
  );
  assert.equal(
    classify(
      'S024',
      'production',
      '/rest/v1/blog_posts',
      query([...blogEntries, ['private', 'value']]),
    ),
    false,
    'extra',
  );
  assert.equal(
    classify('S024', 'production', '/rest/v1/blog_posts', query([...blogEntries, blogEntries[0]!])),
    false,
    'duplicate',
  );
  assert.equal(
    classify(
      'S024',
      'production',
      '/rest/v1/blog_posts',
      query([blogEntries[1]!, blogEntries[0]!, ...blogEntries.slice(2)]),
    ),
    false,
    'order',
  );
  assert.equal(
    classify(
      'S024',
      'production',
      '/rest/v1/blog_posts',
      blogListQuery.replace('status=eq.published', 'status=neq.published'),
    ),
    false,
    'operator',
  );
  assert.equal(
    classify(
      'S024',
      'production',
      '/rest/v1/blog_posts',
      blogListQuery.replace(`lte.${encodeURIComponent(NOW)}`, 'lte.not-a-date'),
    ),
    false,
    'date',
  );
  assert.equal(
    classify('S028', 'production', '/rest/v1/blog_posts', blogDetailQuery('p1-12-missing')),
    false,
    'slug',
  );
  assert.equal(
    classify('S038', 'production', '/rest/v1/cms_pages', cmsDetailQuery('legal/other')),
    false,
    'CMS slug',
  );
});

test('preload permits a reviewed PostgREST query without retaining its query or values', () => {
  const root = mkdtempSync(join(tmpdir(), 'p112-query-egress-'));
  const log = join(root, 'egress.jsonl');
  const outcomePath = join(root, 'outcomes.json');
  const allowedUrl = `http://127.0.0.1:56321/rest/v1/blog_posts?${blogListQuery}`;
  const deniedUrl = `${allowedUrl}&private=value`;
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      resolve('scripts/p1-12-acceptance/server-egress-preload.mjs'),
      '--input-type=module',
      '--eval',
      `
    const { writeFileSync } = await import('node:fs');
    const results = await Promise.allSettled([fetch(${JSON.stringify(allowedUrl)}), fetch(${JSON.stringify(deniedUrl)})]);
    writeFileSync(process.env.P112_OUTCOME_PATH, JSON.stringify(results.map((item) => item.status === 'rejected' ? String(item.reason?.message) : 'fulfilled')));
  `,
    ],
    {
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        P112_ACCEPTANCE_LOCAL_ONLY: '1',
        P112_EGRESS_LOG_PATH: log,
        P112_EVIDENCE_PROFILE: 'production',
        P112_EVIDENCE_STATE_ID: 'S024',
        P112_EGRESS_INITIATOR: 'app',
        P112_OUTCOME_PATH: outcomePath,
      },
    },
  );
  assert.equal(child.status, 0);
  const outcomes = JSON.parse(readFileSync(outcomePath, 'utf8')) as string[];
  assert.doesNotMatch(outcomes[0]!, /egress policy denied/u);
  assert.match(outcomes[1]!, /policy|denied/u);
  const evidence = readFileSync(log, 'utf8');
  assert.doesNotMatch(evidence, /select|published_at|private|value|2026-09-09/u);
  const records = evidence
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(
    records.some(
      ({ path, category }) => path === '/rest/v1/blog_posts' && category === 'postgrest',
    ),
    true,
  );
  assert.equal(records.filter(({ category }) => category === 'policy-denied').length, 1);
});

test('reconciles sanitized observed records and fails closed', () => {
  const ready = JSON.stringify({
    profile: 'production',
    stateId: 'S127',
    category: 'observer-ready',
  });
  const valid = JSON.stringify({
    method: 'GET',
    path: '/auth/v1/user',
    profile: 'production',
    stateId: 'S127',
    initiator: 'app',
    status: 401,
    category: 'auth',
  });
  assert.equal(parseAndReconcileP112EgressLog(`${ready}\n`, 'production', 'S127').length, 0);
  assert.equal(
    parseAndReconcileP112EgressLog(`${ready}\n${valid}\n`, 'production', 'S127').length,
    1,
  );
  assert.throws(() => parseAndReconcileP112EgressLog('', 'production', 'S127'), /missing/u);
  assert.throws(
    () => parseAndReconcileP112EgressLog(`${ready}\n${ready}\n`, 'production', 'S127'),
    /duplicate/u,
  );
  assert.throws(
    () => parseAndReconcileP112EgressLog(`${valid}\n`, 'production', 'S127'),
    /marker/u,
  );
  assert.throws(
    () =>
      parseAndReconcileP112EgressLog(
        `${ready}\n${valid.replace('"auth"', '"policy-denied"').replace('401', '"policy-denied"')}\n`,
        'production',
        'S127',
      ),
    /denied/u,
  );
  assert.throws(
    () =>
      parseAndReconcileP112EgressLog(
        `${ready}\n${valid.slice(0, -1)},"query":"secret"}\n`,
        'production',
        'S127',
      ),
    /shape/u,
  );
  assert.throws(
    () =>
      parseAndReconcileP112EgressLog(
        `${ready}\n${valid.replace('401', '500')}\n`,
        'production',
        'S127',
      ),
    /status/u,
  );
  assert.throws(
    () =>
      parseAndReconcileP112EgressLog(
        `${ready}\n${valid.replace('401', '"transport-failure"')}\n`,
        'production',
        'S127',
      ),
    /status/u,
  );
  assert.throws(
    () =>
      parseAndReconcileP112EgressLog(
        `${ready}\n${valid.replace('S127', 'S078')}\n`,
        'production',
        'S127',
      ),
    /profile/u,
  );
});

test('preload denies unreviewed paths and emits query-free evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'p112-egress-'));
  const log = join(root, 'egress.jsonl');
  const outcomePath = join(root, 'outcomes.json');
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      resolve('scripts/p1-12-acceptance/server-egress-preload.mjs'),
      '--input-type=module',
      '--eval',
      `
    const { writeFileSync } = await import('node:fs');
    const results = await Promise.allSettled([
      fetch('http://127.0.0.1:56321/auth/v1/user'),
      fetch('http://127.0.0.1:56321/auth/v1/user?token=private'),
      fetch('http://127.0.0.1:56321/rest/v1/not-reviewed?token=private'),
      fetch('https://example.com/private?token=private'),
    ]);
    writeFileSync(process.env.P112_OUTCOME_PATH, JSON.stringify(results.map((item) => item.status === 'rejected' ? String(item.reason?.message) : 'fulfilled')));
  `,
    ],
    {
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        P112_ACCEPTANCE_LOCAL_ONLY: '1',
        P112_EGRESS_LOG_PATH: log,
        P112_EVIDENCE_PROFILE: 'production',
        P112_EVIDENCE_STATE_ID: 'S127',
        P112_EGRESS_INITIATOR: 'app',
        P112_OUTCOME_PATH: outcomePath,
      },
    },
  );
  assert.equal(child.status, 0);
  const outcomes = JSON.parse(readFileSync(outcomePath, 'utf8')) as string[];
  assert.doesNotMatch(outcomes[0]!, /policy|denied/u);
  assert.match(outcomes[1]!, /policy|denied/u);
  assert.match(outcomes[2]!, /denied/u);
  assert.match(outcomes[3]!, /denied/u);
  const evidence = readFileSync(log, 'utf8');
  assert.doesNotMatch(evidence, /token|private|example\.com/u);
  const records = evidence
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.deepEqual(records[0], {
    profile: 'production',
    stateId: 'S127',
    category: 'observer-ready',
  });
  const allowed = records.find(
    ({ path, category }) => path === '/auth/v1/user' && category === 'auth',
  );
  assert.equal(allowed?.method, 'GET');
  assert.equal(allowed?.category, 'auth');
  assert.ok(typeof allowed?.status === 'number' || allowed?.status === 'transport-failure');
  assert.equal(
    records.filter(
      ({ category, status }) => category === 'policy-denied' && status === 'policy-denied',
    ).length,
    3,
  );
  assert.equal(records.length, 5);
});

test('preload locally rejects the exact Next development version check without egress evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'p112-next-version-'));
  const log = join(root, 'egress.jsonl');
  const outcomePath = join(root, 'outcomes.json');
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      resolve('scripts/p1-12-acceptance/server-egress-preload.mjs'),
      '--input-type=module',
      '--eval',
      `
    const { writeFileSync } = await import('node:fs');
    const results = await Promise.allSettled([
      fetch('https://registry.npmjs.org/-/package/next/dist-tags'),
      fetch('https://registry.npmjs.org/-/package/next/dist-tags?extra=1'),
    ]);
    writeFileSync(process.env.P112_OUTCOME_PATH, JSON.stringify(results.map((item) => String(item.reason?.message))));
  `,
    ],
    {
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'development',
        P112_ACCEPTANCE_LOCAL_ONLY: '1',
        P112_EGRESS_LOG_PATH: log,
        P112_EVIDENCE_PROFILE: 'blog-empty',
        P112_EVIDENCE_STATE_ID: 'S025',
        P112_EGRESS_INITIATOR: 'app',
        P112_OUTCOME_PATH: outcomePath,
      },
    },
  );
  assert.equal(child.status, 0);
  const outcomes = JSON.parse(readFileSync(outcomePath, 'utf8')) as string[];
  assert.match(outcomes[0]!, /version check disabled/u);
  assert.match(outcomes[1]!, /policy denied/u);
  const records = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.deepEqual(records[0], {
    profile: 'blog-empty',
    stateId: 'S025',
    category: 'observer-ready',
  });
  assert.equal(records.filter(({ category }) => category === 'policy-denied').length, 1);
});

test('preload patches both http.get and https.get without stale module bindings', () => {
  const root = mkdtempSync(join(tmpdir(), 'p112-get-egress-'));
  const log = join(root, 'egress.jsonl');
  const outcomePath = join(root, 'outcome.json');
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      resolve('scripts/p1-12-acceptance/server-egress-preload.mjs'),
      '--input-type=module',
      '--eval',
      `
    const http = await import('node:http'); const https = await import('node:https'); const { writeFileSync } = await import('node:fs');
    const allowed = await new Promise((resolve) => {
      try {
        const request = http.get('http://127.0.0.1:56321/auth/v1/user', (response) => { response.resume(); resolve('fulfilled'); });
        request.once('error', (error) => resolve(String(error.message)));
      } catch (error) { resolve(String(error.message)); }
    });
    let denied = 'allowed';
    try { https.get('https://example.com/private'); } catch (error) { denied = String(error.message); }
    writeFileSync(process.env.P112_OUTCOME_PATH, JSON.stringify({ allowed, denied, httpGet: http.get.name, httpsGet: https.get.name }));
  `,
    ],
    {
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        P112_ACCEPTANCE_LOCAL_ONLY: '1',
        P112_EGRESS_LOG_PATH: log,
        P112_EVIDENCE_PROFILE: 'production',
        P112_EVIDENCE_STATE_ID: 'S127',
        P112_EGRESS_INITIATOR: 'app',
        P112_OUTCOME_PATH: outcomePath,
      },
    },
  );
  assert.equal(child.status, 0);
  const outcomes = JSON.parse(readFileSync(outcomePath, 'utf8')) as {
    allowed: string;
    denied: string;
    httpGet: string;
    httpsGet: string;
  };
  assert.equal(outcomes.httpGet, 'guardedGet');
  assert.equal(outcomes.httpsGet, 'guardedGet');
  assert.doesNotMatch(outcomes.allowed, /policy|denied/u);
  assert.match(outcomes.denied, /policy|denied/u);
  assert.doesNotMatch(readFileSync(log, 'utf8'), /example\.com|private/u);
});

test('safe runner uses only the controlled egress preload option', () => {
  assert.equal(
    serverEgressNodeOptions(),
    '--import=./scripts/p1-12-acceptance/server-egress-preload.mjs',
  );
});

test('preload fail-closes Unix socket connections without retaining the socket path', () => {
  const root = mkdtempSync(join(tmpdir(), 'p112-unix-egress-'));
  const log = join(root, 'egress.jsonl');
  const outcomePath = join(root, 'outcome.txt');
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      resolve('scripts/p1-12-acceptance/server-egress-preload.mjs'),
      '--input-type=module',
      '--eval',
      `
    const { connect } = await import('node:net'); const { writeFileSync } = await import('node:fs');
    try { connect({ path: '/tmp/private-provider.sock' }); writeFileSync(process.env.P112_OUTCOME_PATH, 'allowed'); }
    catch (error) { writeFileSync(process.env.P112_OUTCOME_PATH, String(error.message)); }
  `,
    ],
    {
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        P112_ACCEPTANCE_LOCAL_ONLY: '1',
        P112_EGRESS_LOG_PATH: log,
        P112_EVIDENCE_PROFILE: 'production',
        P112_EVIDENCE_STATE_ID: 'S007',
        P112_EGRESS_INITIATOR: 'app',
        P112_OUTCOME_PATH: outcomePath,
      },
    },
  );
  assert.equal(child.status, 0);
  assert.match(readFileSync(outcomePath, 'utf8'), /denied/u);
  const evidence = readFileSync(log, 'utf8');
  assert.doesNotMatch(evidence, /private-provider|\/tmp/u);
  assert.match(evidence, /"path":"\(unix-socket\)"/u);
  assert.match(evidence, /"category":"policy-denied"/u);
});

test('strict observer used by builds denies unreviewed loopback TCP and remote fetch', () => {
  const root = mkdtempSync(join(tmpdir(), 'p112-build-egress-'));
  const log = join(root, 'egress.jsonl');
  const outcomePath = join(root, 'outcome.json');
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      resolve('scripts/p1-12-acceptance/server-egress-preload.mjs'),
      '--input-type=module',
      '--eval',
      `
    const { connect } = await import('node:net'); const { writeFileSync } = await import('node:fs');
    const values = [];
    try { connect({ host: '127.0.0.1', port: 59999 }); values.push('tcp-allowed'); } catch (error) { values.push(String(error.message)); }
    try { await fetch('https://example.com/build-secret'); values.push('remote-allowed'); } catch (error) { values.push(String(error.message)); }
    writeFileSync(process.env.P112_OUTCOME_PATH, JSON.stringify(values));
  `,
    ],
    {
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        P112_ACCEPTANCE_LOCAL_ONLY: '1',
        P112_EGRESS_LOG_PATH: log,
        P112_EVIDENCE_PROFILE: 'production',
        P112_EVIDENCE_STATE_ID: 'S007',
        P112_EGRESS_INITIATOR: 'app',
        P112_OUTCOME_PATH: outcomePath,
      },
    },
  );
  assert.equal(child.status, 0);
  assert.deepEqual(
    JSON.parse(readFileSync(outcomePath, 'utf8')).map((value: string) => /denied/u.test(value)),
    [true, true],
  );
  assert.doesNotMatch(readFileSync(log, 'utf8'), /example\.com|build-secret|59999/u);
});
