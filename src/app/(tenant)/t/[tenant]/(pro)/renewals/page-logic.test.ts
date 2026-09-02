import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseRenewalSearch, parseRenewalTab } from './page-logic';

test('renewal action tab contract consumes active and normalizes unsupported values', () => {
  assert.equal(parseRenewalTab('active'), 'active');
  assert.equal(parseRenewalTab('completed'), 'completed');
  assert.equal(parseRenewalTab('cancelled'), 'cancelled');
  assert.equal(parseRenewalTab('renewal-id'), 'active');
  assert.equal(parseRenewalTab(undefined), 'active');
});

test('renewal targeting validates a single UUID while preserving its tab', () => {
  const renewalId = '88888888-8888-4888-8888-888888888888';
  assert.deepEqual(parseRenewalSearch({ tab: 'completed', renewal: [renewalId, 'ignored'] }), {
    tab: 'completed',
    renewalId,
  });
  assert.deepEqual(parseRenewalSearch({ tab: 'active', renewal: 'bad' }), {
    tab: 'active',
    renewalId: undefined,
  });
});

test('renewal dashboard filters consume type and supported day windows', () => {
  assert.deepEqual(parseRenewalSearch({ tab: 'active', type: 'license', days: '90' }), {
    tab: 'active',
    renewalId: undefined,
    type: 'license',
    days: 90,
  });
  assert.deepEqual(parseRenewalSearch({ type: 'passport', days: '45' }), {
    tab: 'active',
    renewalId: undefined,
  });
});

test('renewal deadline drilldown consumes exact date and Dubai period', () => {
  assert.deepEqual(
    parseRenewalSearch({
      tab: 'active',
      date: '2026-08-12',
      period: 'afternoon',
      eventTypes: 'renewal',
    }),
    {
      tab: 'active',
      renewalId: undefined,
      deadlineDate: '2026-08-12',
      deadlinePeriod: 'afternoon',
    },
  );
});

test('renewals page consumes focus in an assigned-Company exact workspace read', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/renewals/page.tsx'),
    'utf8',
  );
  const dal = readFileSync(join(process.cwd(), 'src/lib/data/renewals.ts'), 'utf8');
  const workspace = readFileSync(
    join(process.cwd(), 'src/lib/data/pro-renewal-workspace.ts'),
    'utf8',
  );
  assert.match(page, /parseRenewalWorkspaceSearch\(await searchParams\)/);
  assert.match(page, /listProRenewalWorkspace\(/);
  assert.match(workspace, /focus:.*first\('focus'\).*first\('target'\).*first\('renewal'\)/);
  assert.match(workspace, /\.eq\('tenant_id', access\.tenantId\)/);
  assert.match(workspace, /\.eq\('company_id', access\.companyId\)/);
  assert.match(workspace, /if \(search\.focus\) scoped = scoped\.eq\('id', search\.focus\)/);
  assert.match(dal, /\.eq\('tenant_id', tenantId\)/);
});
