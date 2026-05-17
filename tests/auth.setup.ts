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

import { test as setup, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

type Role = 'admin' | 'pro' | 'customer' | 'employee';

interface RoleConfig {
  role: Role;
  emailEnv: string;
  passwordEnv: string;
  storagePath: string;
}

const AUTH_DIR = 'tests/.auth';

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

for (const cfg of ROLES) {
  setup(`auth: sign in as ${cfg.role}`, async ({ browser, baseURL }, testInfo) => {
    const email = process.env[cfg.emailEnv];
    const password = process.env[cfg.passwordEnv];

    if (!email || !password) {
      const reason =
        `${cfg.emailEnv}/${cfg.passwordEnv} not set; ${cfg.role} authenticated specs will be skipped. ` +
        `Set them to enable authenticated a11y coverage for ${cfg.role}.`;
      // Visible in CI output without failing the suite.
       
      console.warn(`[auth.setup] SKIP ${cfg.role}: ${reason}`);
      testInfo.skip(true, reason);
      return;
    }

    if (!baseURL) {
      testInfo.skip(true, 'baseURL not configured; cannot perform auth setup');
      return;
    }

    const context = await browser.newContext({ baseURL });
    try {
      // 1. Acquire a CSRF cookie + token. The login route requires both via
      //    a double-submit pattern (cookie `mandoob-csrf`, header
      //    `x-mandoob-csrf`).
      const csrfRes = await context.request.get('/api/v1/auth/csrf');
      expect(
        csrfRes.ok(),
        `[auth.setup] CSRF fetch failed for ${cfg.role}: ${csrfRes.status()}`,
      ).toBe(true);
      const csrfBody = (await csrfRes.json()) as { token?: string };
      const csrfToken = csrfBody.token;
      if (!csrfToken) {
        throw new Error('[auth.setup] CSRF response missing token');
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
    } finally {
      await context.close();
    }
  });
}
