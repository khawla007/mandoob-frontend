// Playwright global setup project.
//
// For each launch role (admin / pro / customer / employee) it:
//   1. Reads E2E_<ROLE>_EMAIL + E2E_<ROLE>_PASSWORD from the environment.
//   2. Hits POST /api/v1/auth/login through a fresh BrowserContext (so cookies
//      land in the same storage state Playwright will reuse for the spec).
//   3. Persists the resulting cookies/session to tests/.auth/<role>.json.
//
// Locked decisions enforced here:
//   - Env-driven creds; no secrets in repo (`docs/step-30b-prompt.md` §locked #4).
//   - Skip-with-warning on any missing creds — never fail the setup. The
//     downstream authenticated spec also skips when its storage file is
//     missing (`docs/step-30b-prompt.md` §locked #5).
//   - One setup project, four storage files (`docs/step-30b-prompt.md` §locked #2, #3).

import { test as setup, type BrowserContext } from '@playwright/test';
import { chmod, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { generateTotp } from '../scripts/p2-acceptance/totp';

type Role = 'admin' | 'pro' | 'customer' | 'employee';

type P2Secrets = {
  tenantSlug: string;
  roles: Array<{
    role: 'super_admin' | 'pro' | 'customer' | 'employee';
    email: string;
    password: string;
    totpSecret?: string;
  }>;
};

interface RoleConfig {
  role: Role;
  emailEnv: string;
  passwordEnv: string;
  storagePath: string;
}

const AUTH_DIR = 'tests/.auth';
const STRICT = process.env.P2_ACCEPTANCE_STRICT === '1';
const P2_SECRET_PATH = `${AUTH_DIR}/p2-credentials.json`;

async function strictCredentials(role: Role): Promise<{
  email: string;
  password: string;
  totpSecret: string;
  tenantSlug: string;
}> {
  const mode = (await stat(P2_SECRET_PATH)).mode & 0o777;
  if (mode !== 0o600) throw new Error(`[auth.setup] strict secret file must be mode 0600`);
  const parsed = JSON.parse(await readFile(P2_SECRET_PATH, 'utf8')) as P2Secrets;
  const fixtureRole = role === 'admin' ? 'super_admin' : role;
  const credential = parsed.roles.find((candidate) => candidate.role === fixtureRole);
  if (!credential?.email || !credential.password || !credential.totpSecret || !parsed.tenantSlug) {
    throw new Error(`[auth.setup] strict fixture credential is incomplete for ${role}`);
  }
  return {
    email: credential.email,
    password: credential.password,
    totpSecret: credential.totpSecret,
    tenantSlug: parsed.tenantSlug,
  };
}

function expectedHome(role: Role, tenantSlug: string) {
  if (role === 'admin') return '/admin';
  if (role === 'pro') return `/t/${tenantSlug}/dashboard`;
  if (role === 'customer') return `/t/${tenantSlug}/portal`;
  return `/t/${tenantSlug}/employee/dashboard`;
}

function acceptedLoginDestination(role: Role, tenantSlug: string) {
  if (role === 'customer') return '/account';
  if (role === 'employee') return `/t/${tenantSlug}/me`;
  return expectedHome(role, tenantSlug);
}

const ROLES: ReadonlyArray<RoleConfig> = [
  {
    role: 'admin',
    emailEnv: 'E2E_ADMIN_EMAIL',
    passwordEnv: 'E2E_ADMIN_PASSWORD',
    storagePath: `${AUTH_DIR}/admin.json`,
  },
  {
    role: 'pro',
    emailEnv: 'E2E_PRO_EMAIL',
    passwordEnv: 'E2E_PRO_PASSWORD',
    storagePath: `${AUTH_DIR}/pro.json`,
  },
  {
    role: 'customer',
    emailEnv: 'E2E_CUSTOMER_EMAIL',
    passwordEnv: 'E2E_CUSTOMER_PASSWORD',
    storagePath: `${AUTH_DIR}/customer.json`,
  },
  {
    role: 'employee',
    emailEnv: 'E2E_EMPLOYEE_EMAIL',
    passwordEnv: 'E2E_EMPLOYEE_PASSWORD',
    storagePath: `${AUTH_DIR}/employee.json`,
  },
];

async function removeStrictStorageStates(): Promise<void> {
  await Promise.all(
    ROLES.map(({ storagePath }) =>
      unlink(storagePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      }),
    ),
  );
}

async function assertStrictStoragePermissions(storagePath: string): Promise<void> {
  const directoryMode = (await stat(dirname(storagePath))).mode & 0o777;
  const fileMode = (await stat(storagePath)).mode & 0o777;
  if (directoryMode !== 0o700 || fileMode !== 0o600) {
    throw new Error('[auth.setup] strict storage state permissions are not owner-only');
  }
}

setup.describe.configure({ mode: 'serial' });
setup.beforeAll(async () => {
  if (STRICT) await removeStrictStorageStates();
});

for (const cfg of ROLES) {
  setup(`auth: sign in as ${cfg.role}`, async ({ browser, baseURL }, testInfo) => {
    setup.setTimeout(60_000);
    let strict: Awaited<ReturnType<typeof strictCredentials>> | null = null;
    try {
      strict = STRICT ? await strictCredentials(cfg.role) : null;
    } catch (error) {
      await removeStrictStorageStates();
      throw error;
    }
    const email = strict?.email ?? process.env[cfg.emailEnv];
    const password = strict?.password ?? process.env[cfg.passwordEnv];

    if (!email || !password) {
      const reason =
        `${cfg.emailEnv}/${cfg.passwordEnv} not set; ${cfg.role} authenticated specs will be skipped. ` +
        `Set them to enable authenticated a11y coverage for ${cfg.role}.`;
      // Visible in CI output without failing the suite.

      console.warn(`[auth.setup] SKIP ${cfg.role}: ${reason}`);
      if (STRICT) {
        await removeStrictStorageStates();
        throw new Error(reason);
      }
      testInfo.skip(true, reason);
      return;
    }

    if (!baseURL) {
      if (STRICT) {
        await removeStrictStorageStates();
        throw new Error('baseURL not configured; cannot perform strict auth setup');
      }
      testInfo.skip(true, 'baseURL not configured; cannot perform auth setup');
      return;
    }

    let context: BrowserContext | null = null;
    try {
      context = await browser.newContext({ baseURL });
      if (STRICT && strict) {
        const page = await context.newPage();
        await page.goto('/login', { waitUntil: 'networkidle' });
        await page.getByRole('textbox', { name: /^email$/i }).fill(email);
        await page.getByLabel(/^password/i).fill(password);
        await page.getByRole('button', { name: /^sign in$/i }).click();
        const home = expectedHome(cfg.role, strict.tenantSlug);
        await page.waitForURL((url) =>
          ['/mfa/challenge', home, acceptedLoginDestination(cfg.role, strict.tenantSlug)].includes(
            url.pathname,
          ),
        );
        if (new URL(page.url()).pathname !== '/mfa/challenge') {
          await page.goto(`/mfa/challenge?next=${encodeURIComponent(home)}`, {
            waitUntil: 'networkidle',
          });
        }
        await page.getByLabel(/6-digit code/i).fill(generateTotp(strict.totpSecret));
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForURL((url) => url.pathname === home, { waitUntil: 'networkidle' });
        await page.waitForTimeout(250);
        if (new URL(page.url()).pathname !== home) {
          throw new Error(`[auth.setup] ${cfg.role} did not retain its AAL2 role home`);
        }
        await mkdir(dirname(cfg.storagePath), { recursive: true, mode: 0o700 });
        await chmod(dirname(cfg.storagePath), 0o700);
        await writeFile(cfg.storagePath, JSON.stringify(await context.storageState(), null, 2), {
          encoding: 'utf8',
          mode: 0o600,
        });
        await chmod(cfg.storagePath, 0o600);
        await assertStrictStoragePermissions(cfg.storagePath);
        return;
      }
      // 1. Acquire a CSRF cookie + token. The login route requires both via
      //    a double-submit pattern (cookie `mandoob-csrf`, header
      //    `x-mandoob-csrf`).
      const csrfRes = await context.request.get('/api/v1/auth/csrf');
      if (!csrfRes.ok()) {
        // Skip-with-warning: dev server may not have CSRF cookie wired up yet.
        // Matches the login-failure branch below.

        console.warn(`[auth.setup] SKIP ${cfg.role}: CSRF fetch failed (${csrfRes.status()})`);
        testInfo.skip(true, `${cfg.role} CSRF fetch failed (${csrfRes.status()})`);
        return;
      }
      const csrfBody = (await csrfRes.json()) as { token?: string };
      const csrfToken = csrfBody.token;
      if (!csrfToken) {
        console.warn(`[auth.setup] SKIP ${cfg.role}: CSRF response missing token`);
        testInfo.skip(true, `${cfg.role} CSRF response missing token`);
        return;
      }

      // 2. Sign in. The route sets Supabase session cookies on success.
      const loginRes = await context.request.post('/api/v1/auth/login', {
        headers: { 'x-mandoob-csrf': csrfToken, 'content-type': 'application/json' },
        data: { email, password, rememberMe: true },
      });
      if (!loginRes.ok()) {
        const body = await loginRes.text();
        // Skip-with-warning: log + persist nothing. Downstream spec will skip.

        console.warn(
          `[auth.setup] SKIP ${cfg.role}: login returned ${loginRes.status()}: ${body.slice(0, 200)}`,
        );
        testInfo.skip(true, `${cfg.role} login failed (${loginRes.status()})`);
        return;
      }

      // 3. Persist storage state. Folder must exist; ensure it before write.
      await mkdir(dirname(cfg.storagePath), { recursive: true });
      const state = await context.storageState();
      await writeFile(cfg.storagePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      if (STRICT) await removeStrictStorageStates();
      throw error;
    } finally {
      if (context) await context.close();
    }
  });
}
