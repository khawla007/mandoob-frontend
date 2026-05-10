import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTenantPath, buildTenantUrl } from './url';

test('buildTenantPath preserves direct /t slug links', () => {
  assert.equal(buildTenantPath('firm-a'), '/t/firm-a');
  assert.equal(buildTenantPath('firm-a', '/dashboard'), '/t/firm-a/dashboard');
});

test('buildTenantUrl builds localhost tenant subdomain URLs', () => {
  assert.equal(
    buildTenantUrl({ slug: 'firm-a', rootDomain: 'localhost:3000', path: '/dashboard' }),
    'http://firm-a.localhost:3000/dashboard',
  );
});

test('buildTenantUrl builds production tenant subdomain URLs', () => {
  assert.equal(
    buildTenantUrl({ slug: 'firm-a', rootDomain: 'mandoob.example', path: '/portal' }),
    'https://firm-a.mandoob.example/portal',
  );
});
