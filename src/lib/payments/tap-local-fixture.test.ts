import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalTapFixture } from './tap-local-fixture';

test('local fixture deterministically models success, failure, timeout-after-effect and crash', async () => {
  const fixture = createLocalTapFixture('test');
  assert.equal((await fixture.effect('key-success', 'success')).kind, 'created');
  assert.equal((await fixture.effect('key-failure', 'failure')).kind, 'failed');
  assert.equal((await fixture.effect('key-timeout', 'timeout-after-effect')).kind, 'unknown');
  assert.equal((await fixture.lookup('key-timeout'))?.providerReference, 'local-key-timeout');
  assert.equal((await fixture.effect('key-before', 'timeout-before-effect')).kind, 'unknown');
  assert.equal(await fixture.lookup('key-before'), null);
  await assert.rejects(() => fixture.effect('key-crash', 'crash'), /LOCAL_PROVIDER_CRASH/u);
  assert.equal(await fixture.lookup('key-crash'), null);
});

test('production rejects local provider mode', () => {
  assert.throws(() => createLocalTapFixture('production'), /LOCAL_PROVIDER_DISABLED/u);
});
