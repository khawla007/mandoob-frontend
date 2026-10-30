#!/usr/bin/env tsx
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseSupabaseStatus } from '../p2-acceptance/local-target';
import {
  ACCEPTANCE_WORKDIR,
  removeAcceptanceWorkdir,
  runSupabase,
} from '../p2-acceptance/supabase-cli';
import { resolveReducedBrowserExecutable } from './browser-executable';

export {
  buildReducedLoginPath,
  buildReducedMfaPath,
  buildReducedAuthorizationMatrix,
  type ReducedAuthorizationEntry,
} from './reduced-auth-matrix';

export const REDUCED_AUTH_PORT = 3113;
export const REDUCED_AUTH_RESULTS_DIR = '.p3-13-auth-test-results';
const DEFAULT_BASE_URL = `http://127.0.0.1:${REDUCED_AUTH_PORT}`;

function fail(message: string): never {
  throw new Error(`P3_13_AUTH_SMOKE: ${message}`);
}

export function assertReducedAuthEnvironment(env: Record<string, string | undefined>): URL {
  if (env.P2_ACCEPTANCE_LOCAL_ONLY !== '1') fail('explicit local-only opt-in is required');
  let url: URL;
  try {
    url = new URL(env.P3_13_AUTH_BASE_URL ?? DEFAULT_BASE_URL);
  } catch {
    return fail('base URL is invalid');
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== String(REDUCED_AUTH_PORT) ||
    url.pathname !== '/'
  ) {
    fail('base URL must be http://127.0.0.1:3113');
  }
  return url;
}

function requireCommand(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  if (result.error || result.status !== 0) fail(`${label} is unavailable`);
}

function runTsx(args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(process.execPath, ['--import', 'tsx', ...args], { env, stdio: 'inherit' });
}

async function waitForApp(url: URL, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail('application exited before becoming ready');
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch {
      // The bounded readiness loop remains local and fails closed at the deadline.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  fail('application did not become ready within 120 seconds');
}

export async function removeReducedAuthArtifacts(root = process.cwd()): Promise<void> {
  await rm(resolve(root, REDUCED_AUTH_RESULTS_DIR), { recursive: true, force: true });
}

async function stopChild(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
    new Promise<void>((resolveWait) => setTimeout(resolveWait, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

type CleanupState = {
  app: ChildProcess | null;
  stackPrepared: boolean;
  runError?: unknown;
};

type CleanupDependencies = {
  stopApp: (app: ChildProcess | null) => Promise<unknown>;
  stopStack: () => Promise<unknown> | unknown;
  removeArtifacts: () => Promise<unknown>;
  removeWorkdir: () => Promise<unknown>;
};

export async function finalizeReducedAuthRun(
  state: CleanupState,
  dependencies: CleanupDependencies = {
    stopApp: stopChild,
    stopStack: () => runSupabase(['stop', '--no-backup'], { encoding: 'utf8', stdio: 'ignore' }),
    removeArtifacts: removeReducedAuthArtifacts,
    removeWorkdir: removeAcceptanceWorkdir,
  },
): Promise<void> {
  const failures: unknown[] = state.runError === undefined ? [] : [state.runError];
  let stackStopFailed = false;
  try {
    await dependencies.stopApp(state.app);
  } catch (error) {
    failures.push(error);
  }
  if (state.stackPrepared) {
    try {
      await dependencies.stopStack();
    } catch (error) {
      stackStopFailed = true;
      failures.push(error);
    }
  }
  try {
    await dependencies.removeArtifacts();
  } catch (error) {
    failures.push(error);
  }
  if (!stackStopFailed) {
    try {
      await dependencies.removeWorkdir();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'P3_13_AUTH_SMOKE: run and cleanup failed');
  }
}

async function main(): Promise<void> {
  const baseUrl = assertReducedAuthEnvironment(process.env);
  resolveReducedBrowserExecutable(process.env);
  const cli = process.env.SUPABASE_CLI?.trim() || 'supabase';
  requireCommand(cli, ['--version'], 'Supabase CLI');
  requireCommand('docker', ['info'], 'Docker daemon');
  requireCommand(resolve('node_modules/.bin/playwright'), ['--version'], 'Playwright');

  const env = {
    ...process.env,
    P2_ACCEPTANCE_LOCAL_ONLY: '1',
    P2_ACCEPTANCE_APP_PORT: String(REDUCED_AUTH_PORT),
    P3_13_REDUCED_AUTH_FIXTURE: '1',
    P3_13_ACCEPTANCE_LOCAL_ONLY: '1',
    P3_13_REDUCED_AUTH_SECRET_PATH: resolve(ACCEPTANCE_WORKDIR, 'p3-13-auth/p2-credentials.json'),
    P3_13_AUTH_BASE_URL: baseUrl.origin,
    E2E_BASE_URL: baseUrl.origin,
    LAUNCH_SKIP_WEB_SERVER: '1',
  };
  let app: ChildProcess | null = null;
  let stackPrepared = false;
  let runError: unknown;
  try {
    // Setup can fail after starting containers, so cleanup must already be armed.
    stackPrepared = true;
    runTsx(['scripts/p2-acceptance/fixture.ts', 'setup'], env);
    const status = parseSupabaseStatus(runSupabase(['status', '-o', 'json']));
    const read = (key: string) => {
      const value = status[key];
      if (typeof value !== 'string' || value.length === 0) fail(`local status is missing ${key}`);
      return value;
    };
    runTsx(['scripts/p2-acceptance/run-app.ts', 'build'], env);
    app = spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/p2-acceptance/run-app.ts', 'start'],
      { env, stdio: 'inherit' },
    );
    await waitForApp(baseUrl, app);
    execFileSync(
      resolve('node_modules/.bin/playwright'),
      ['test', '--config', 'playwright.p3-13-auth.config.ts'],
      {
        env: {
          ...env,
          P3_13_SUPABASE_URL: read('API_URL'),
          P3_13_SUPABASE_ANON_KEY: read('ANON_KEY'),
          P3_13_SUPABASE_SERVICE_ROLE_KEY: read('SERVICE_ROLE_KEY'),
        },
        stdio: 'inherit',
      },
    );
  } catch (error) {
    runError = error;
  }
  await finalizeReducedAuthRun({ app, stackPrepared, runError });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'P3_13_AUTH_SMOKE: failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
