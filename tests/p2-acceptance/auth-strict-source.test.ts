import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const setup = read('tests/auth.setup.ts');

test('strict auth fails closed while ordinary developer auth can still skip', () => {
  assert.match(setup, /process\.env\.P2_ACCEPTANCE_STRICT === '1'/u);
  assert.match(setup, /await strictCredentials\(cfg\.role\)/u);
  assert.match(setup, /await stat\(P2_SECRET_PATH\)/u);
  assert.match(setup, /strict secret file must be mode 0600/u);
  assert.match(setup, /strict fixture credential is incomplete for \$\{role\}/u);
  assert.match(setup, /if \(STRICT\) \{[\s\S]*throw new Error\(reason\)/u);
  assert.match(setup, /if \(STRICT\) \{[\s\S]*baseURL not configured/u);
  assert.match(setup, /testInfo\.skip\(true, reason\)/u);
});

test('strict auth uses pre-enrolled fixture secrets with visible login and challenge UI', () => {
  for (const role of ['admin', 'pro', 'customer', 'employee']) {
    assert.match(setup, new RegExp(`role: '${role}'`, 'u'));
  }
  assert.match(setup, /page\.goto\('\/login'/u);
  assert.match(setup, /getByRole\('textbox', \{ name: \/\^email\$\/i \}\)\.fill\(email\)/u);
  assert.match(setup, /getByLabel\(\/\^password\/i\)\.fill\(password\)/u);
  assert.match(setup, /getByRole\('button', \{ name: \/\^sign in\$\/i \}\)\.click\(\)/u);
  assert.match(setup, /page\.goto\(`\/mfa\/challenge\?next=/u);
  assert.match(setup, /getByLabel\(\/6-digit code\/i\)\.fill\(generateTotp/u);
  assert.match(setup, /getByRole\('button', \{ name: \/continue\/i \}\)\.click\(\)/u);

  assert.match(setup, /totpSecret/u);
});

test('strict destinations exercise authoritative role, tenant, assignment, and AAL boundaries', () => {
  assert.match(setup, /if \(role === 'admin'\) return '\/admin'/u);
  assert.match(setup, /if \(role === 'pro'\) return `\/t\/\$\{tenantSlug\}\/dashboard`/u);
  assert.match(setup, /if \(role === 'customer'\) return `\/t\/\$\{tenantSlug\}\/portal`/u);
  assert.match(setup, /return `\/t\/\$\{tenantSlug\}\/employee\/dashboard`/u);
  assert.match(setup, /url\.pathname === home/u);
  assert.match(setup, /did not retain its AAL2 role home/u);

  const roleGuard = read('src/lib/auth/require-role.ts');
  assert.match(roleGuard, /\.select\('role, status, tenant_id'\)/u);
  assert.match(roleGuard, /profile\.status !== 'active'/u);
  assert.match(roleGuard, /if \(!allowed\.has\(profile\.role\)\) return null/u);
  assert.match(roleGuard, /read_authoritative_pro_tenant/u);
  assert.match(roleGuard, /session\.aal !== 'aal2'/u);

  const companyGuard = read('src/lib/auth/require-company-access.ts');
  assert.match(companyGuard, /role !== session\.role \|\| status !== 'active'/u);
  assert.match(companyGuard, /authorize_pro_company_access/u);
  assert.match(companyGuard, /if \(error \|\| allowed !== true\) return denyAccess/u);

  assert.match(read('src/app/admin/layout.tsx'), /requireRole\('super_admin', 'admin'\)/u);
  assert.match(
    read('src/app/(tenant)/t/[tenant]/(pro)/layout.tsx'),
    /requireProTenantRouteAccess\(slug\)/u,
  );
  assert.match(
    read('src/app/(tenant)/t/[tenant]/(customer)/layout.tsx'),
    /requireCustomerTenantRouteAccess\(slug\)/u,
  );
  assert.match(
    read('src/app/(tenant)/t/[tenant]/(employee)/layout.tsx'),
    /requireRole\('employee'\)[\s\S]*session\.tenantId !== tenant\.id/u,
  );
});

test('strict storage state is serially replaced, runtime-checked, and cleaned up', () => {
  assert.match(setup, /setup\.describe\.configure\(\{ mode: 'serial' \}\)/u);
  assert.match(setup, /setup\.beforeAll\([\s\S]*removeStrictStorageStates\(\)/u);
  assert.match(setup, /ROLES\.map\(\(\{ storagePath \}\)/u);
  assert.match(setup, /chmod\(dirname\(cfg\.storagePath\), 0o700\)/u);
  assert.match(setup, /chmod\(cfg\.storagePath, 0o600\)/u);
  assert.match(setup, /assertStrictStoragePermissions\(cfg\.storagePath\)/u);
  assert.match(setup, /directoryMode !== 0o700 \|\| fileMode !== 0o600/u);
  assert.match(setup, /catch \(error\) \{[\s\S]*removeStrictStorageStates\(\)[\s\S]*throw error/u);
  assert.match(
    setup,
    /let context:[^;]+\| null = null;[\s\S]*try \{[\s\S]*context = await browser\.newContext/u,
  );
  assert.match(setup, /finally \{[\s\S]*if \(context\) await context\.close\(\)/u);

  const fixture = read('scripts/p2-acceptance/fixture.ts');
  assert.match(fixture, /\['admin', 'pro', 'customer', 'employee'\] as const/u);
  assert.match(fixture, /resolve\(`tests\/\.auth\/\$\{role\}\.json`\)/u);
  assert.match(fixture, /await unlink\(file\)\.catch/u);
  const teardown = fixture.slice(fixture.indexOf("if (action === 'teardown')"));
  assert.ok(teardown.indexOf('assertReusableFixture(') < teardown.indexOf("runSupabase(['stop'"));
  assert.ok(
    teardown.indexOf('assertReusableFixtureSnapshot(') < teardown.indexOf("runSupabase(['stop'"),
  );
  assert.match(teardown, /removeAcceptanceWorkdir\(\)/u);
  assert.match(read('.gitignore'), /tests\/\.auth\/\*\*/u);
});

test('Playwright wires authenticated acceptance through the setup project', () => {
  const config = read('playwright.config.ts');
  assert.match(config, /name: 'setup',[\s\S]*testMatch: \/auth\\\.setup\\\.ts\//u);
  assert.match(
    config,
    /name: 'p2-acceptance',[\s\S]*testMatch: \/p2-acceptance\\\/authenticated-desktop\\\.spec\\\.ts\/[\s\S]*dependencies: \['setup'\]/u,
  );
  assert.match(
    config,
    /name: 'p2-auth-strict',[\s\S]*testMatch: \/p2-acceptance\\\/auth-strict\\\.spec\\\.ts\/[\s\S]*retries: 0,[\s\S]*dependencies: \['setup'\]/u,
  );
});
