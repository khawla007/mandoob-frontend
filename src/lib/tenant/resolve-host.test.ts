import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPassthroughPath, resolveHost } from './resolve-host';

test('resolveHost maps root and www hosts to marketing', () => {
  assert.deepEqual(resolveHost({ host: 'localhost:3000', rootDomain: 'localhost:3000' }), {
    kind: 'marketing',
  });
  assert.deepEqual(resolveHost({ host: 'www.localhost:3000', rootDomain: 'localhost:3000' }), {
    kind: 'marketing',
  });
  assert.deepEqual(resolveHost({ host: 'www.mandoob.test', rootDomain: 'mandoob.test' }), {
    kind: 'marketing',
  });
});

test('resolveHost maps admin subdomains to admin', () => {
  assert.deepEqual(resolveHost({ host: 'admin.localhost:3000', rootDomain: 'localhost:3000' }), {
    kind: 'admin',
  });
  assert.deepEqual(resolveHost({ host: 'ADMIN.mandoob.test', rootDomain: 'mandoob.test' }), {
    kind: 'admin',
  });
});

test('resolveHost maps tenant subdomains to tenant slugs', () => {
  assert.deepEqual(resolveHost({ host: 'firm-a.localhost:3000', rootDomain: 'localhost:3000' }), {
    kind: 'tenant',
    slug: 'firm-a',
  });
  assert.deepEqual(resolveHost({ host: 'firm-a.mandoob.test', rootDomain: 'mandoob.test' }), {
    kind: 'tenant',
    slug: 'firm-a',
  });
});

test('resolveHost treats reserved tenant labels as marketing', () => {
  for (const host of ['api.localhost:3000', 'dashboard.localhost:3000', 'app.mandoob.test']) {
    assert.deepEqual(resolveHost({ host, rootDomain: host.endsWith('test') ? 'mandoob.test' : 'localhost:3000' }), {
      kind: 'marketing',
    });
  }
});

test('isPassthroughPath keeps API and auth routes at root', () => {
  for (const pathname of ['/api/v1/public/health', '/login', '/register/pro', '/invite/token']) {
    assert.equal(isPassthroughPath(pathname), true, pathname);
  }
  for (const pathname of ['/', '/dashboard', '/t/firm-a/dashboard']) {
    assert.equal(isPassthroughPath(pathname), false, pathname);
  }
});
