import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

type Result = { data: Record<string, unknown> | null; error: { message?: string } | null };

function fakeSupabase(results: Result[]) {
  const calls: Array<{ kind: string; name: string; value?: unknown }> = [];
  let resultIndex = 0;
  return {
    calls,
    from(table: string) {
      calls.push({ kind: 'from', name: table });
      const chain = {
        select(value: string) {
          calls.push({ kind: 'select', name: value });
          return chain;
        },
        eq(name: string, value: unknown) {
          calls.push({ kind: 'eq', name, value });
          return chain;
        },
        async maybeSingle() {
          return results[resultIndex++];
        },
      };
      return chain;
    },
  };
}

const tenantId = '11111111-1111-4111-8111-111111111111';
const profileId = '22222222-2222-4222-8222-222222222222';
const companyId = '33333333-3333-4333-8333-333333333333';
const company = {
  id: companyId,
  tenant_id: tenantId,
  company_name: 'Acme Trading LLC',
  status: 'active',
  jurisdiction: 'Dubai Mainland',
  trade_license_no: 'DED-123456',
  license_expiry: '2027-08-17',
  shareholders: [],
  registered_activities: [],
  created_at: '2026-08-17T10:00:00.000Z',
  updated_at: '2026-08-17T10:00:00.000Z',
};

test('assigned company loader resolves tenant then verifies the live PRO assignment', async () => {
  const { readAssignedCompanyForPro } = await import('./company-profile');
  const supabase = fakeSupabase([
    {
      data: { id: tenantId, slug: 'acme', name: 'Acme', plan: 'pro', status: 'active' },
      error: null,
    },
    { data: { company_id: companyId }, error: null },
    { data: company, error: null },
  ]);

  const result = await readAssignedCompanyForPro(profileId, 'acme', {
    supabase: supabase as never,
  });

  assert.deepEqual(result, {
    id: companyId,
    tenantId,
    companyName: 'Acme Trading LLC',
    status: 'active',
    jurisdiction: 'Dubai Mainland',
    tradeLicenseNo: 'DED-123456',
    licenseExpiry: '2027-08-17',
    shareholders: [],
    registeredActivities: [],
    createdAt: '2026-08-17T10:00:00.000Z',
    updatedAt: '2026-08-17T10:00:00.000Z',
  });
  assert.deepEqual(
    supabase.calls.filter((call) => call.kind === 'from').map((call) => call.name),
    ['tenants', 'pro_company_assignments', 'company_profiles'],
  );
  assert.ok(
    supabase.calls.some(
      (call) => call.kind === 'eq' && call.name === 'pro_profile_id' && call.value === profileId,
    ),
  );
  assert.ok(
    supabase.calls.some(
      (call) => call.kind === 'eq' && call.name === 'tenant_id' && call.value === tenantId,
    ),
  );
  assert.ok(
    supabase.calls.some(
      (call) => call.kind === 'eq' && call.name === 'status' && call.value === 'active',
    ),
  );
});

test('released, unknown, wrong-tenant and read-error states expose the same not-found result', async () => {
  const { readAssignedCompanyForPro } = await import('./company-profile');
  const tenant = { id: tenantId, slug: 'acme', name: 'Acme', plan: 'pro', status: 'active' };
  const cases: Result[][] = [
    [
      { data: tenant, error: null },
      { data: null, error: null },
    ],
    [{ data: null, error: null }],
    [
      { data: tenant, error: null },
      { data: null, error: { message: 'secret database detail' } },
    ],
    [
      { data: tenant, error: null },
      { data: { company_id: companyId }, error: null },
      { data: null, error: null },
    ],
  ];

  for (const results of cases) {
    const value = await readAssignedCompanyForPro(profileId, 'acme', {
      supabase: fakeSupabase(results) as never,
    });
    assert.equal(value, null);
  }
});

test('invalid profile identifiers fail closed without querying service-role data', async () => {
  const { readAssignedCompanyForPro } = await import('./company-profile');
  const supabase = fakeSupabase([]);
  assert.equal(
    await readAssignedCompanyForPro('not-a-profile', 'acme', { supabase: supabase as never }),
    null,
  );
  assert.equal(supabase.calls.length, 0);
});
