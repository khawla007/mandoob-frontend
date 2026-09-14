import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./DashboardRouteStates.tsx', import.meta.url), 'utf8');

test('route states provide the complete shared presentation vocabulary', () => {
  for (const state of [
    'loading',
    'empty',
    'no-results',
    'partial',
    'blocked',
    'error',
    'permission',
    'unavailable',
  ]) {
    assert.match(source, new RegExp(`state: '${state}'`));
  }
  assert.match(source, /role="status"/u);
  assert.match(source, /aria-busy="true"/u);
  assert.match(source, /<h2/u);
  assert.match(source, /useId/u);
});

test('error state accepts sanitized copy and recovery controls, never a raw Error', () => {
  assert.match(source, /safeDescription: string/u);
  assert.match(source, /onRetry\?: \(\) => void/u);
  assert.doesNotMatch(source, /error:\s*Error/u);
  assert.doesNotMatch(source, /error\.(?:message|digest)/u);
});

test('role route groups install effective loading and error boundaries', () => {
  const routeRoots = [
    'admin',
    '(tenant)/t/[tenant]/(pro)',
    '(tenant)/t/[tenant]/(customer)',
    '(tenant)/t/[tenant]/(employee)',
  ];

  for (const routeRoot of routeRoots) {
    for (const filename of ['loading.tsx', 'error.tsx']) {
      assert.doesNotThrow(() =>
        readFileSync(new URL(`../../app/${routeRoot}/${filename}`, import.meta.url), 'utf8'),
      );
    }
  }
});
