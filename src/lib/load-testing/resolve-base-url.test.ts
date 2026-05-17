// Tests for the k6 resolveBaseUrl helper at load-tests/k6/_resolve-base-url.js.
// k6 is not invoked here — we exercise the pure helper directly under Node so
// the production deny list is verified as part of the standard test suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as helper from '../../../../load-tests/k6/_resolve-base-url.js';

const { resolveBaseUrl, isProductionHost, isExplicitlyAllowedHost, PROD_HOST_DENY_LIST } =
  helper as unknown as {
    resolveBaseUrl: (opts: { env: Record<string, string | undefined> }) => string;
    isProductionHost: (host: string) => boolean;
    isExplicitlyAllowedHost: (host: string, override?: string) => boolean;
    PROD_HOST_DENY_LIST: readonly string[];
  };

test('resolveBaseUrl throws when K6_BASE_URL is unset', () => {
  assert.throws(() => resolveBaseUrl({ env: {} }), /K6_BASE_URL is required/);
  assert.throws(() => resolveBaseUrl({ env: { K6_BASE_URL: '' } }), /K6_BASE_URL is required/);
  assert.throws(() => resolveBaseUrl({ env: { K6_BASE_URL: '   ' } }), /K6_BASE_URL is required/);
});

test('resolveBaseUrl accepts localhost variants', () => {
  for (const url of [
    'http://localhost:3000',
    'http://localhost:3100',
    'http://127.0.0.1:3000',
    'http://0.0.0.0:3000',
  ]) {
    assert.equal(resolveBaseUrl({ env: { K6_BASE_URL: url } }), url);
  }
});

test('resolveBaseUrl strips trailing slashes', () => {
  assert.equal(
    resolveBaseUrl({ env: { K6_BASE_URL: 'http://localhost:3000/' } }),
    'http://localhost:3000',
  );
  assert.equal(
    resolveBaseUrl({ env: { K6_BASE_URL: 'http://localhost:3000///' } }),
    'http://localhost:3000',
  );
});

test('resolveBaseUrl refuses Mandoob production hosts', () => {
  for (const host of PROD_HOST_DENY_LIST) {
    assert.throws(
      () => resolveBaseUrl({ env: { K6_BASE_URL: `https://${host}` } }),
      /production deny list/,
    );
  }
});

test('resolveBaseUrl refuses subdomains of production hosts', () => {
  assert.throws(
    () => resolveBaseUrl({ env: { K6_BASE_URL: 'https://customer.mandoob.com' } }),
    /production deny list/,
  );
  assert.throws(
    () => resolveBaseUrl({ env: { K6_BASE_URL: 'https://firm.mandoob.io' } }),
    /production deny list/,
  );
});

test('resolveBaseUrl refuses unknown HTTPS hosts unless allow-listed', () => {
  assert.throws(
    () => resolveBaseUrl({ env: { K6_BASE_URL: 'https://random-host.example.com' } }),
    /not in the allow list/,
  );
});

test('resolveBaseUrl refuses Mandoob staging subdomains (parent in deny list)', () => {
  // staging.mandoob.io ends with mandoob.io → denied. STAGING_HOST cannot
  // bypass the production deny list; staging must live on a non-Mandoob host
  // or operators must extend PROD_HOST_DENY_LIST + ALLOWED_SUFFIXES jointly.
  assert.throws(
    () =>
      resolveBaseUrl({
        env: { K6_BASE_URL: 'https://app.staging.mandoob.io' },
      }),
    /production deny list/,
  );
});

test('resolveBaseUrl accepts vercel.app preview URLs', () => {
  assert.equal(
    resolveBaseUrl({ env: { K6_BASE_URL: 'https://mandoob-pr-42.vercel.app' } }),
    'https://mandoob-pr-42.vercel.app',
  );
});

test('resolveBaseUrl honors STAGING_HOST opt-in', () => {
  const env = {
    K6_BASE_URL: 'https://qa.partner-network.io',
    STAGING_HOST: 'qa.partner-network.io',
  };
  assert.equal(resolveBaseUrl({ env }), 'https://qa.partner-network.io');
});

test('STAGING_HOST cannot override the production deny list', () => {
  assert.throws(
    () =>
      resolveBaseUrl({
        env: { K6_BASE_URL: 'https://mandoob.com', STAGING_HOST: 'mandoob.com' },
      }),
    /production deny list/,
  );
});

test('resolveBaseUrl rejects malformed URLs', () => {
  assert.throws(
    () => resolveBaseUrl({ env: { K6_BASE_URL: 'not a url at all' } }),
    /not a valid URL/,
  );
});

test('isProductionHost handles port suffixes and case', () => {
  assert.equal(isProductionHost('Mandoob.COM'), true);
  assert.equal(isProductionHost('mandoob.com:443'), true);
  assert.equal(isProductionHost('app.mandoob.io'), true);
  assert.equal(isProductionHost('localhost'), false);
});

test('isExplicitlyAllowedHost recognizes loopback + dev suffixes', () => {
  assert.equal(isExplicitlyAllowedHost('localhost'), true);
  assert.equal(isExplicitlyAllowedHost('127.0.0.1'), true);
  assert.equal(isExplicitlyAllowedHost('firm.localhost'), true);
  assert.equal(isExplicitlyAllowedHost('preview.dev.local'), true);
  assert.equal(isExplicitlyAllowedHost('mandoob-pr-1.vercel.app'), true);
  assert.equal(isExplicitlyAllowedHost('random.example.com'), false);
  // staging.mandoob.io passes the suffix allow-list only by way of STAGING_HOST
  // override; deny-list precedence is checked by resolveBaseUrl, not here.
  assert.equal(isExplicitlyAllowedHost('app.staging.mandoob.io'), false);
});
