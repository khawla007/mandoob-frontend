import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { P112_BASELINE } from './contract';

test('baseline validation accepts only exact empty identity/content state and four legal pages', async () => {
  const baseline = await import('./baseline');
  assert.equal(typeof baseline.assertExactBaseline, 'function');
  const snapshot = {
    ...P112_BASELINE,
    cmsPageSlugs: [...P112_BASELINE.cmsPageSlugs],
  };
  assert.doesNotThrow(() => baseline.assertExactBaseline?.(snapshot));
  assert.equal('rateLimits' in P112_BASELINE, true);
  assert.equal('authEvents' in P112_BASELINE, true);
  assert.equal('authFailedAttempts' in P112_BASELINE, true);
  assert.throws(() => baseline.assertExactBaseline?.({ ...snapshot, rateLimits: 1 }));
  assert.throws(() => baseline.assertExactBaseline?.({ ...snapshot, authUsers: 1 }));
  assert.throws(() => baseline.assertExactBaseline?.({ ...snapshot, blogPosts: Number.NaN }));
  assert.throws(() =>
    baseline.assertExactBaseline?.({ ...snapshot, cmsPageSlugs: ['privacy', 'terms', 'pdpl'] }),
  );
  assert.throws(() =>
    baseline.assertExactBaseline?.({
      ...snapshot,
      cmsPageSlugs: [...snapshot.cmsPageSlugs, 'unexpected'],
    }),
  );
});

test('runtime credentials are cryptographic-shaped and TOTP is deterministic without logging', async () => {
  const secrets = await import('./secrets');
  assert.equal(typeof secrets.generateRuntimeCredentials, 'function');
  assert.equal(typeof secrets.totpAt, 'function');
  const first = secrets.generateRuntimeCredentials?.();
  const second = secrets.generateRuntimeCredentials?.();
  assert.ok(first && second);
  assert.notEqual(first.email, second.email);
  assert.notEqual(first.password, second.password);
  assert.match(first.email, /^p112-[a-zA-Z0-9_-]+@example\.invalid$/u);
  assert.ok(first.password.length >= 24);
  assert.equal(secrets.totpAt?.('JBSWY3DPEHPK3PXP', 59_000), '996554');
});

test('secret manifests are owner-only, round-trip, and removable', async () => {
  const secrets = await import('./secrets');
  assert.equal(typeof secrets.createSecretStore, 'function');
  const parent = await mkdtemp(join(tmpdir(), 'p112-secrets-test-'));
  const root = join(parent, '.p1-12-acceptance-runtime');
  const store = secrets.createSecretStore?.(root);
  const manifest = {
    phase: 'content-created' as const,
    email: 'p112-secret@example.invalid',
    password: 'not-a-real-password-value',
    userId: '11200000-0000-4000-8000-000000000099',
  };
  await assert.rejects(() =>
    store?.save({ email: manifest.email, password: manifest.password } as never),
  );
  await store?.save(manifest);
  assert.equal((await stat(root)).mode & 0o777, 0o700);
  assert.equal((await stat(join(root, 'fixture-secrets.json'))).mode & 0o777, 0o600);
  assert.deepEqual(await store?.load(), manifest);
  assert.doesNotMatch(
    await readFile(join(root, 'fixture-secrets.json'), 'utf8'),
    /service[_-]?role/iu,
  );
  await store?.remove();
  assert.equal(await store?.load(), null);
});

test('failed pre-rename journal update preserves the prior phase and removes its exact temp', async () => {
  const secrets = await import('./secrets');
  const parent = await mkdtemp(join(tmpdir(), 'p112-journal-test-'));
  const root = join(parent, '.p1-12-acceptance-runtime');
  let rejectRename = false;
  const store = secrets.createSecretStore?.(root, {
    async rename(from: string, to: string) {
      if (rejectRename) throw new Error('injected pre-rename failure with secret detail');
      await rename(from, to);
    },
  });
  const planned = {
    phase: 'planned' as const,
    email: 'p112-secret@example.invalid',
    password: 'not-a-real-password-value',
  };
  await store?.save(planned);
  rejectRename = true;
  await assert.rejects(() =>
    store?.save({
      ...planned,
      phase: 'auth-created',
      userId: '11200000-0000-4000-8000-000000000099',
    }),
  );
  assert.deepEqual(await store?.load(), planned);
  assert.equal((await stat(root)).mode & 0o777, 0o700);
  assert.equal((await stat(join(root, 'fixture-secrets.json'))).mode & 0o777, 0o600);
  await assert.rejects(stat(join(root, 'fixture-secrets.json.next')), { code: 'ENOENT' });
  assert.doesNotMatch(
    await readFile(join(root, 'fixture-secrets.json'), 'utf8'),
    /auth-created|11200000-0000-4000-8000-000000000099/u,
  );
});
