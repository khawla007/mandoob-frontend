import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveReducedBrowserExecutable } from './browser-executable';
import {
  assertReducedAuthEnvironment,
  buildReducedLoginPath,
  buildReducedMfaPath,
  buildReducedAuthorizationMatrix,
  finalizeReducedAuthRun,
  REDUCED_AUTH_RESULTS_DIR,
  REDUCED_AUTH_PORT,
  removeReducedAuthArtifacts,
} from './reduced-auth-smoke';

test('browser override accepts only an absolute canonical executable regular file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p3-13-browser-'));
  try {
    const executable = join(root, 'chrome');
    const link = join(root, 'chrome-link');
    const directory = join(root, 'chrome-directory');
    const nonExecutable = join(root, 'not-executable');
    await writeFile(executable, '#!/bin/sh\n', { mode: 0o700 });
    await symlink(executable, link, 'file');
    await mkdir(directory);
    await writeFile(nonExecutable, 'not executable', { mode: 0o600 });

    assert.equal(resolveReducedBrowserExecutable({}), undefined);
    assert.equal(
      resolveReducedBrowserExecutable({ P3_13_BROWSER_EXECUTABLE: executable }),
      executable,
    );
    for (const candidate of ['relative/chrome', link, directory, nonExecutable]) {
      assert.throws(
        () => resolveReducedBrowserExecutable({ P3_13_BROWSER_EXECUTABLE: candidate }),
        /P3_13_AUTH_SMOKE/u,
      );
    }
  } finally {
    await chmod(root, 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

test('reduced authorization matrix covers inactive, AAL1 and AAL2 for every disposable role', () => {
  const matrix = buildReducedAuthorizationMatrix('p2-12-company');
  assert.deepEqual(
    matrix.map(({ role }) => role),
    ['admin', 'pro', 'customer', 'employee'],
  );
  for (const entry of matrix) {
    assert.deepEqual(entry.states, ['inactive', 'aal1', 'aal2']);
    assert.equal(entry.home.startsWith('/'), true);
  }
  assert.equal(matrix.find(({ role }) => role === 'admin')?.authoritativeRole, 'super_admin');
  assert.deepEqual(
    matrix.map(({ role, aal1Destination }) => [role, aal1Destination]),
    [
      ['admin', 'challenge'],
      ['pro', 'challenge'],
      ['customer', 'home'],
      ['employee', 'home'],
    ],
  );
  assert.deepEqual(
    matrix.map(({ role, loginPath }) => [role, loginPath]),
    [
      ['admin', '/mfa/challenge'],
      ['pro', '/mfa/challenge'],
      ['customer', '/t/p2-12-company/portal'],
      ['employee', '/t/p2-12-company/employee/dashboard'],
    ],
  );
});

test('reduced login preserves the exact encoded guarded home through MFA', () => {
  assert.equal(buildReducedLoginPath('/admin'), '/login?next=%2Fadmin');
  assert.equal(buildReducedMfaPath('/admin'), '/mfa/challenge?next=%2Fadmin');
  assert.equal(
    buildReducedLoginPath('/t/p2-12-company/employee/dashboard'),
    '/login?next=%2Ft%2Fp2-12-company%2Femployee%2Fdashboard',
  );
  assert.equal(
    buildReducedMfaPath('/t/p2-12-company/employee/dashboard'),
    '/mfa/challenge?next=%2Ft%2Fp2-12-company%2Femployee%2Fdashboard',
  );
});

test('wrong-company denial is limited to company-scoped roles', () => {
  const matrix = buildReducedAuthorizationMatrix('fixture-company');
  assert.equal(matrix.find(({ role }) => role === 'admin')?.wrongCompanyPath, null);
  for (const role of ['pro', 'customer', 'employee'] as const) {
    const entry = matrix.find((candidate) => candidate.role === role);
    assert.match(entry?.wrongCompanyPath ?? '', /^\/t\/p3-13-wrong-company\//u);
  }
});

test('runner accepts only explicit local-only loopback port 3113 configuration', () => {
  assert.equal(REDUCED_AUTH_PORT, 3113);
  assert.doesNotThrow(() =>
    assertReducedAuthEnvironment({
      P2_ACCEPTANCE_LOCAL_ONLY: '1',
      P3_13_AUTH_BASE_URL: 'http://127.0.0.1:3113',
    }),
  );
  for (const env of [
    {},
    { P2_ACCEPTANCE_LOCAL_ONLY: '1', P3_13_AUTH_BASE_URL: 'https://127.0.0.1:3113' },
    { P2_ACCEPTANCE_LOCAL_ONLY: '1', P3_13_AUTH_BASE_URL: 'http://localhost:3100' },
    { P2_ACCEPTANCE_LOCAL_ONLY: '1', P3_13_AUTH_BASE_URL: 'http://example.com:3113' },
  ]) {
    assert.throws(() => assertReducedAuthEnvironment(env), /P3_13_AUTH_SMOKE/u);
  }
});

test('runner rebuilds the production app with the exact P3.13 local-origin flag before start', () => {
  const source = readFileSync('scripts/p3-13-acceptance/reduced-auth-smoke.ts', 'utf8');
  assert.match(source, /P3_13_ACCEPTANCE_LOCAL_ONLY: '1'/u);
  const build = source.indexOf("run-app.ts', 'build'");
  const start = source.indexOf("run-app.ts', 'start'");
  assert.equal(build >= 0, true);
  assert.equal(start > build, true);
});

test('reduced runner validates and config propagates only its browser executable override', () => {
  const runner = readFileSync('scripts/p3-13-acceptance/reduced-auth-smoke.ts', 'utf8');
  const config = readFileSync('playwright.p3-13-auth.config.ts', 'utf8');
  assert.match(runner, /resolveReducedBrowserExecutable\(process\.env\)/u);
  assert.match(config, /resolveReducedBrowserExecutable\(process\.env\)/u);
  assert.match(config, /launchOptions/u);
  assert.match(config, /executablePath/u);
});

test('reduced cleanup preserves shared P2 auth state and removes only its result directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p3-13-cleanup-'));
  try {
    const auth = join(root, 'tests/.auth');
    await mkdir(auth, { recursive: true });
    const shared = ['p2-credentials', 'admin', 'pro', 'customer', 'employee'].map((name) =>
      join(auth, `${name}.json`),
    );
    for (const path of shared) await writeFile(path, 'shared');
    const results = join(root, REDUCED_AUTH_RESULTS_DIR);
    await mkdir(results);
    await writeFile(join(results, 'trace.zip'), 'owned');

    await removeReducedAuthArtifacts(root);

    for (const path of shared) assert.equal(existsSync(path), true, path);
    assert.equal(existsSync(results), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stack stop failure is aggregated, exits through rejection and preserves workdir metadata', async () => {
  const primary = new Error('browser failed');
  const stop = new Error('stack stop failed');
  const calls: string[] = [];
  await assert.rejects(
    finalizeReducedAuthRun(
      { app: null, stackPrepared: true, runError: primary },
      {
        stopApp: async () => calls.push('app'),
        stopStack: () => {
          calls.push('stack');
          throw stop;
        },
        removeArtifacts: async () => calls.push('artifacts'),
        removeWorkdir: async () => calls.push('workdir'),
      },
    ),
    (error: unknown) => {
      assert.equal(error instanceof AggregateError, true);
      assert.deepEqual((error as AggregateError).errors, [primary, stop]);
      return true;
    },
  );
  assert.deepEqual(calls, ['app', 'stack', 'artifacts']);
});
