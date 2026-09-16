import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Admin overview directly authorizes and composes the typed command dashboard', async () => {
  const source = await readFile(new URL('./page.tsx', import.meta.url), 'utf8');
  assert.match(source, /await requirePlatformOperator\(\)/u);
  assert.match(source, /const \{ period \} = await searchParams/u);
  assert.match(source, /resolveDashboardPeriod\(period\)/u);
  assert.match(source, /loadAdminCommandDashboard/u);
  assert.match(source, /<CommandDashboard/u);
  assert.match(source, /<Suspense/u);
  assert.match(source, /fallback=\{<AdminCommandDashboardLoading/u);
  assert.ok(
    source.indexOf('await requirePlatformOperator()') <
      source.indexOf('loadAdminCommandDashboard(resolvedPeriod)'),
  );
  assert.doesNotMatch(source, /getAdminKpis|getSignupSeries|getRecentLogins/u);
});
