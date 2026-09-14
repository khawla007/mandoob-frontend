import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  isDevelopmentSourceUnavailableEvidence,
  withDevelopmentCollectionEvidence,
  withDevelopmentItemEvidence,
} from './development-evidence';
import * as developmentEvidence from './development-evidence';

test('production always uses the real collection and item loaders', async () => {
  const collection = withDevelopmentCollectionEvidence(async () => ['real'], {
    nodeEnv: 'production',
    mode: 'empty',
  });
  const item = withDevelopmentItemEvidence(async (slug: string) => (slug ? 'real' : null), {
    nodeEnv: 'production',
    mode: 'fixture',
    fixture: 'synthetic',
  });

  assert.deepEqual(await collection(), ['real']);
  assert.equal(await item('slug'), 'real');
});

test('development collection evidence can model empty and unavailable without mutation', async () => {
  const empty = withDevelopmentCollectionEvidence(async () => ['real'], {
    nodeEnv: 'development',
    mode: 'empty',
  });
  const unavailable = withDevelopmentCollectionEvidence(async () => ['real'], {
    nodeEnv: 'development',
    mode: 'unavailable',
  });

  assert.deepEqual(await empty(), []);
  await assert.rejects(unavailable, /isolated development evidence/u);
});

test('development item evidence can model fixture, missing, and unavailable reads', async () => {
  const fixture = withDevelopmentItemEvidence(async (slug: string) => (slug ? 'real' : null), {
    nodeEnv: 'development',
    mode: 'fixture',
    fixture: 'reviewed fixture',
  });
  const missing = withDevelopmentItemEvidence(async (slug: string) => (slug ? 'real' : null), {
    nodeEnv: 'development',
    mode: 'missing',
  });
  const unavailable = withDevelopmentItemEvidence(async (slug: string) => (slug ? 'real' : null), {
    nodeEnv: 'development',
    mode: 'unavailable',
  });

  assert.equal(await fixture('slug'), 'reviewed fixture');
  assert.equal(await missing('slug'), null);
  await assert.rejects(() => unavailable('slug'), /isolated development evidence/u);
});

test('source-unavailable evidence is exact and development-only', () => {
  assert.equal(
    isDevelopmentSourceUnavailableEvidence({
      nodeEnv: 'development',
      mode: 'authority-source-unavailable',
      acceptedMode: 'authority-source-unavailable',
    }),
    true,
  );
  assert.equal(
    isDevelopmentSourceUnavailableEvidence({
      nodeEnv: 'production',
      mode: 'authority-source-unavailable',
      acceptedMode: 'authority-source-unavailable',
    }),
    false,
  );
  assert.equal(
    isDevelopmentSourceUnavailableEvidence({
      nodeEnv: 'development',
      mode: undefined,
      acceptedMode: 'authority-source-unavailable',
    }),
    false,
  );
  assert.equal(
    isDevelopmentSourceUnavailableEvidence({
      nodeEnv: 'development',
      mode: 'anything-else',
      acceptedMode: 'authority-source-unavailable',
    }),
    false,
  );
});

test('route error evidence enables only for the exact development-only mode', () => {
  const routeError = (
    developmentEvidence as typeof developmentEvidence & {
      isDevelopmentRouteErrorEvidence?: (options: {
        nodeEnv?: string;
        fixtureMode?: string;
        mode?: string;
      }) => boolean;
    }
  ).isDevelopmentRouteErrorEvidence;

  assert.equal(typeof routeError, 'function');
  assert.equal(
    routeError?.({ nodeEnv: 'production', fixtureMode: 'fixture', mode: 'error' }),
    false,
  );
  assert.equal(
    routeError?.({ nodeEnv: 'development', fixtureMode: 'fixture', mode: 'anything-else' }),
    false,
  );
  assert.equal(routeError?.({ nodeEnv: 'development', mode: 'error' }), false);
  assert.equal(
    routeError?.({ nodeEnv: 'development', fixtureMode: 'fixture', mode: 'error' }),
    true,
  );
});

test('generic CMS route limits route-error evidence to the fixture body', () => {
  const source = readFileSync('src/app/(public)/[slug]/page.tsx', 'utf8');
  const bodyStart = source.indexOf('export default async function CmsPageRoute');
  const stateRead = source.indexOf(
    'resolveGenericPageState(slug, getCachedPublishedPage)',
    bodyStart,
  );
  const errorEvidence = source.indexOf('isDevelopmentRouteErrorEvidence', stateRead);

  assert.ok(bodyStart >= 0);
  assert.ok(stateRead > bodyStart);
  assert.ok(errorEvidence > stateRead);
  assert.match(
    source.slice(stateRead, errorEvidence + 300),
    /slug === DEVELOPMENT_CMS_EVIDENCE_PAGE\.slug/u,
  );
  assert.match(source, /mode: process\.env\.P112_ROUTE_ERROR_EVIDENCE_STATE/u);
  assert.match(source, /fixtureMode: process\.env\.P107_CMS_EVIDENCE_STATE/u);
  assert.match(source, /<DevelopmentRouteErrorEvidence enabled=\{routeErrorEvidence\}/u);
  assert.doesNotMatch(source.slice(0, bodyStart), /P112_ROUTE_ERROR_EVIDENCE_STATE/u);
});
