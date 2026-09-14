import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

if (process.env.MFA_ENROLL_PAGE_RUNTIME !== '1') {
  test('unauthenticated direct enrollment navigation redirects to login before factor access', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'mfa-enroll-page-'));
    const preloadPath = join(temporaryDirectory, 'preload.cjs');
    try {
      writeFileSync(
        preloadPath,
        `const Module = require('node:module');
const load = Module._load;
globalThis.__redirects = [];
globalThis.__factorReads = 0;
Module._load = function (request, parent, isMain) {
  if (request === 'next-intl/server') return {getTranslations: async () => (key) => key};
  if (request === '@/components/auth/MfaEnrollCard') return {MfaEnrollCard: () => null};
  if (request === '@/lib/auth/require-user') return {
    requireUser: async () => { throw new Error('UNAUTHENTICATED'); },
  };
  if (request === '@/lib/supabase/server') return {
    createSupabaseServerClient: async () => ({auth: {mfa: {listFactors: async () => {
      globalThis.__factorReads += 1;
      return {data: {all: [], totp: []}, error: null};
    }}}}),
  };
  if (request === 'next/navigation') return {redirect: (path) => {
    globalThis.__redirects.push(path);
    throw new Error('NEXT_REDIRECT');
  }};
  return load.call(this, request, parent, isMain);
};`,
      );
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--require', preloadPath, '--test-reporter=spec', import.meta.filename],
        { encoding: 'utf8', env: { ...process.env, MFA_ENROLL_PAGE_RUNTIME: '1' } },
      );
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
} else {
  test('unauthenticated page redirects before factor discovery', async () => {
    const { default: MfaEnrollPage } = await import('./page');
    await assert.rejects(() => MfaEnrollPage(), /NEXT_REDIRECT/u);
    assert.deepEqual((globalThis as typeof globalThis & { __redirects: string[] }).__redirects, [
      '/login',
    ]);
    assert.equal((globalThis as typeof globalThis & { __factorReads: number }).__factorReads, 0);
  });
}
