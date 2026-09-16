import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

type TestGlobals = typeof globalThis & {
  __scenario: 'ready' | 'provider-error' | 'unauthenticated';
  __sessionReads: number;
};

if (process.env.SESSIONS_TAB_RUNTIME_CHILD !== '1') {
  test('sessions tab preserves authentication and propagates session-store failures', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'sessions-tab-'));
    const preloadPath = join(temporaryDirectory, 'preload.cjs');
    try {
      writeFileSync(
        preloadPath,
        `const Module = require('node:module');
const load = Module._load;
globalThis.__scenario = 'ready';
globalThis.__sessionReads = 0;
Module._load = function (request, parent, isMain) {
  if (request === 'next-intl/server') return {
    getTranslations: async (namespace) => (key) => namespace + ':' + key,
  };
  if (request === '@/components/account/SessionsList' || request === './SessionsList') return {
    SessionsList: (props) => ({type: 'sessions-list', props}),
  };
  if (request === '@/lib/auth/require-user') return {
    requireUser: async () => {
      if (globalThis.__scenario === 'unauthenticated') throw new Error('UNAUTHENTICATED');
      return {id: 'user-1', role: 'super_admin'};
    },
  };
  if (request === '@/lib/auth/sessions') return {
    listUserSessions: async () => {
      globalThis.__sessionReads += 1;
      if (globalThis.__scenario === 'provider-error') {
        const error = new Error('session store failed');
        error.code = 'INTERNAL';
        error.status = 500;
        throw error;
      }
      return [{id: 'session-1', userId: 'user-1'}];
    },
  };
  return load.call(this, request, parent, isMain);
};`,
      );
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--require', preloadPath, '--test-reporter=spec', import.meta.filename],
        {
          encoding: 'utf8',
          env: { ...process.env, SESSIONS_TAB_RUNTIME_CHILD: '1' },
        },
      );
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
} else {
  const globals = globalThis as TestGlobals;

  function textContent(node: unknown): string {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(textContent).join(' ');
    if (node && typeof node === 'object' && 'props' in node) {
      return textContent((node as { props: { children?: unknown } }).props.children);
    }
    return '';
  }

  function findSessions(node: unknown): { props: Record<string, unknown> } | undefined {
    if (Array.isArray(node)) {
      for (const child of node) {
        const match = findSessions(child);
        if (match) return match;
      }
      return undefined;
    }
    if (!node || typeof node !== 'object') return undefined;
    if ('props' in node) {
      const props = (node as { props: Record<string, unknown> }).props;
      if ('sessions' in props) return { props };
      return findSessions(props.children);
    }
    return undefined;
  }

  test('ready session data renders the session list', async () => {
    globals.__scenario = 'ready';
    globals.__sessionReads = 0;
    const { SessionsTab } = await import('./SessionsTab');
    const result = await SessionsTab();
    assert.match(textContent(result), /account:tabSessions/u);
    const list = findSessions(result);
    assert.ok(list);
    assert.deepEqual(list.props.sessions, [{ id: 'session-1', userId: 'user-1' }]);
    assert.equal(globals.__sessionReads, 1);
  });

  test('session-store errors are rethrown', async () => {
    globals.__scenario = 'provider-error';
    const { SessionsTab } = await import('./SessionsTab');
    await assert.rejects(
      () => SessionsTab(),
      (error) =>
        error instanceof Error &&
        error.message === 'session store failed' &&
        (error as Error & { code?: string; status?: number }).code === 'INTERNAL' &&
        (error as Error & { code?: string; status?: number }).status === 500,
    );
  });

  test('authentication errors happen before session data access and are rethrown', async () => {
    globals.__scenario = 'unauthenticated';
    globals.__sessionReads = 0;
    const { SessionsTab } = await import('./SessionsTab');
    await assert.rejects(() => SessionsTab(), /UNAUTHENTICATED/u);
    assert.equal(globals.__sessionReads, 0);
  });
}
