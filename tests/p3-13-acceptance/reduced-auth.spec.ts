import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import { generateTotp } from '../../scripts/p2-acceptance/totp';
import { resolveFixtureSecretPath } from '../../scripts/p2-acceptance/acceptance-paths';
import {
  buildReducedAuthorizationMatrix,
  buildReducedLoginPath,
  buildReducedMfaPath,
} from '../../scripts/p3-13-acceptance/reduced-auth-matrix';

type FixtureRole = {
  role: 'super_admin' | 'pro' | 'customer' | 'employee';
  email: string;
  password: string;
  totpSecret: string;
};

type FixtureManifest = {
  tenantSlug: string;
  roles: FixtureRole[];
};

const wrongCompanySlug = 'p3-13-wrong-company';
let manifest: FixtureManifest;
let service: SupabaseClient;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`P3_13_AUTH_SMOKE: ${name} is required`);
  return value;
}

async function userId(email: string): Promise<string> {
  for (let page = 1; ; page += 1) {
    const response = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (response.error) throw new Error('P3_13_AUTH_SMOKE: identity lookup failed');
    const user = response.data.users.find((candidate) => candidate.email === email);
    if (user) return user.id;
    if (response.data.users.length < 200) break;
  }
  throw new Error('P3_13_AUTH_SMOKE: fixture identity is missing');
}

async function setProfileStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
  const response = await service
    .from('profiles')
    .update({ status })
    .eq('id', id)
    .select('id')
    .single();
  if (response.error || response.data?.id !== id) {
    throw new Error('P3_13_AUTH_SMOKE: profile status transition failed');
  }
}

async function inactiveProfileRestore(
  id: string,
  role: FixtureRole['role'],
): Promise<() => Promise<void>> {
  if (role !== 'pro') {
    await setProfileStatus(id, 'disabled');
    return async () => setProfileStatus(id, 'active');
  }

  const admin = manifest.roles.find((candidate) => candidate.role === 'super_admin');
  if (!admin) throw new Error('P3_13_AUTH_SMOKE: super admin fixture is missing');
  const assignment = await service
    .from('pro_company_assignments')
    .select('id, company_id')
    .eq('pro_profile_id', id)
    .eq('status', 'active')
    .single();
  if (assignment.error || !assignment.data?.id || !assignment.data.company_id) {
    throw new Error('P3_13_AUTH_SMOKE: active PRO assignment is missing');
  }
  const actorId = await userId(admin.email);
  const release = await service.rpc('release_company_pro_with_context', {
    p_company_id: assignment.data.company_id,
    p_expected_assignment_id: assignment.data.id,
    p_reason: 'P3.13 inactive authorization probe',
    p_actor_profile_id: actorId,
  });
  if (release.error) throw new Error('P3_13_AUTH_SMOKE: PRO release failed');
  try {
    await setProfileStatus(id, 'disabled');
  } catch (error) {
    const rollback = await service.rpc('assign_pro_to_company_with_context', {
      p_company_id: assignment.data.company_id,
      p_pro_profile_id: id,
      p_actor_profile_id: actorId,
    });
    if (rollback.error) throw new Error('P3_13_AUTH_SMOKE: PRO release rollback failed');
    throw error;
  }
  return async () => {
    await setProfileStatus(id, 'active');
    const restore = await service.rpc('assign_pro_to_company_with_context', {
      p_company_id: assignment.data.company_id,
      p_pro_profile_id: id,
      p_actor_profile_id: actorId,
    });
    if (restore.error) throw new Error('P3_13_AUTH_SMOKE: PRO assignment restore failed');
  };
}

async function loginToAal1(
  browser: Browser,
  role: FixtureRole,
  home: string,
  loginPath: string,
  aal1Destination: 'challenge' | 'home',
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(buildReducedLoginPath(home), { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: /^email$/i }).fill(role.email);
  await page.getByLabel(/^password/i).fill(role.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  const expectedAal1Path = aal1Destination === 'challenge' ? '/mfa/challenge' : home;
  await page.waitForURL((url) => url.pathname === loginPath, { waitUntil: 'networkidle' });
  const automaticDestination = new URL(page.url());
  if (aal1Destination === 'challenge') {
    expect(automaticDestination.pathname).toBe('/mfa/challenge');
    expect(automaticDestination.searchParams.get('next')).toBe(home);
  } else {
    expect(automaticDestination.pathname).toBe(home);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await page.goto(buildReducedMfaPath(home), { waitUntil: 'networkidle' });
    expect(new URL(page.url()).searchParams.get('next')).toBe(home);
  }

  const aal1Probe = await context.newPage();
  await aal1Probe.goto(home, { waitUntil: 'networkidle' });
  expect(new URL(aal1Probe.url()).pathname).toBe(expectedAal1Path);
  if (aal1Destination === 'home') {
    await expect(aal1Probe.locator('main')).toHaveCount(1);
    await expect(aal1Probe.getByRole('heading', { level: 1 })).toHaveCount(1);
  }
  await aal1Probe.close();
  return { context, page };
}

async function elevateToAal2(page: Page, role: FixtureRole, home: string): Promise<void> {
  await page
    .getByRole('textbox', { name: /^authenticator code$/i })
    .fill(generateTotp(role.totpSecret));
  await page.getByRole('button', { name: /continue/i }).click();
  await page.waitForURL((url) => url.pathname === home, { waitUntil: 'networkidle' });
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('lang', /^en(?:-|$)/u);
}

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(async () => {
  manifest = JSON.parse(
    await readFile(resolveFixtureSecretPath(process.env), 'utf8'),
  ) as FixtureManifest;
  service = createClient(
    requiredEnvironment('P3_13_SUPABASE_URL'),
    requiredEnvironment('P3_13_SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const admin = manifest.roles.find(({ role }) => role === 'super_admin');
  if (!admin) throw new Error('P3_13_AUTH_SMOKE: super admin fixture is missing');
  const provision = await service.rpc('provision_company_workspace_atomic', {
    p_actor_id: await userId(admin.email),
    p_company_name: 'P3.13 Wrong Company Probe',
    p_slug: wrongCompanySlug,
    p_plan: 'professional',
  });
  if (provision.error) throw new Error('P3_13_AUTH_SMOKE: wrong-company fixture failed');
  const company = provision.data as { tenant_id?: string; company_id?: string } | null;
  if (!company?.tenant_id || !company.company_id) {
    throw new Error('P3_13_AUTH_SMOKE: wrong-company fixture identifiers are missing');
  }
  for (const [table, id] of [
    ['tenants', company.tenant_id],
    ['company_profiles', company.company_id],
  ] as const) {
    const activated = await service.from(table).update({ status: 'active' }).eq('id', id);
    if (activated.error) throw new Error('P3_13_AUTH_SMOKE: wrong-company activation failed');
  }
});

for (const entry of buildReducedAuthorizationMatrix('p2-12-company')) {
  test(`${entry.role}: inactive, AAL1 and AAL2 authorization smoke`, async ({ browser }) => {
    const fixtureRole = manifest.roles.find(({ role }) => role === entry.authoritativeRole);
    if (!fixtureRole) throw new Error(`P3_13_AUTH_SMOKE: ${entry.role} fixture is missing`);
    const { context, page } = await loginToAal1(
      browser,
      fixtureRole,
      entry.home,
      entry.loginPath,
      entry.aal1Destination,
    );
    const id = await userId(fixtureRole.email);
    let restoreProfile = async () => setProfileStatus(id, 'active');
    try {
      await elevateToAal2(page, fixtureRole, entry.home);
      restoreProfile = await inactiveProfileRestore(id, fixtureRole.role);
      const inactive = await page.goto(entry.home, { waitUntil: 'networkidle' });
      expect(
        (inactive?.status() ?? 0) === 404 || new URL(page.url()).pathname !== entry.home,
        'inactive profile must not retain its guarded home',
      ).toBe(true);
    } finally {
      await restoreProfile();
      await context.close();
    }
  });

  if (entry.wrongCompanyPath) {
    test(`${entry.role}: existing wrong-company route is denied`, async ({ browser }) => {
      const fixtureRole = manifest.roles.find(({ role }) => role === entry.authoritativeRole);
      if (!fixtureRole) throw new Error(`P3_13_AUTH_SMOKE: ${entry.role} fixture is missing`);
      const { context, page } = await loginToAal1(
        browser,
        fixtureRole,
        entry.home,
        entry.loginPath,
        entry.aal1Destination,
      );
      try {
        await elevateToAal2(page, fixtureRole, entry.home);
        const response = await page.goto(entry.wrongCompanyPath!, { waitUntil: 'networkidle' });
        expect(
          (response?.status() ?? 0) === 404 ||
            new URL(page.url()).pathname !== entry.wrongCompanyPath,
          'cross-company access must be denied without exposing a dashboard',
        ).toBe(true);
        await expect(page.locator('.dashboard-surface')).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }
}
