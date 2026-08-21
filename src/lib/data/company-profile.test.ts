import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

type Result = {
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  error: { message?: string } | null;
};

function fakeSupabase(results: Result[]) {
  const calls: Array<{ kind: string; name: string; value?: unknown }> = [];
  let resultIndex = 0;
  return {
    calls,
    async rpc(name: string, value: unknown) {
      calls.push({ kind: 'rpc', name, value });
      return results[resultIndex++];
    },
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
  licensing_authority: 'Dubai Mainland',
  trade_license_no: 'DED-123456',
  license_expiry: '2027-08-17',
  onboarding_status: 'in_progress',
  onboarding_version: 4,
  company_shareholders: [{ count: 2 }],
  company_registered_activities: [{ count: 3 }],
  company_onboarding_sections: [
    { section_key: 'legal', status: 'complete' },
    { section_key: 'shareholders', status: 'complete' },
    { section_key: 'activities', status: 'complete' },
    { section_key: 'office', status: 'incomplete' },
    { section_key: 'establishment', status: 'incomplete' },
    { section_key: 'bank', status: 'incomplete' },
  ],
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
    {
      data: [
        { code: 'BANK_SECTION_INCOMPLETE', section: 'bank', state: 'blocked' },
        { code: 'OFFICE_SECTION_INCOMPLETE', section: 'office', state: 'blocked' },
      ],
      error: null,
    },
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
    shareholderCount: 2,
    registeredActivityCount: 3,
    onboardingStatus: 'in_progress',
    onboardingVersion: 4,
    sectionProgress: {
      legal: 'complete',
      shareholders: 'complete',
      activities: 'complete',
      office: 'incomplete',
      establishment: 'incomplete',
      bank: 'incomplete',
    },
    readinessCodes: ['OFFICE_SECTION_INCOMPLETE', 'BANK_SECTION_INCOMPLETE'],
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
  const companySelect = supabase.calls.find(
    (call) => call.kind === 'select' && call.name.includes('company_onboarding_sections'),
  );
  assert.ok(companySelect);
  for (const relationship of [
    'company_shareholders!company_shareholders_company_tenant_fk(count)',
    'company_registered_activities!company_registered_activities_company_tenant_fk(count)',
    'company_onboarding_sections!company_onboarding_sections_company_tenant_fk(section_key, status)',
  ]) {
    assert.match(companySelect.name, new RegExp(relationship.replace(/[()]/gu, '\\$&'), 'u'));
  }
  assert.doesNotMatch(
    companySelect.name,
    /(?:^|,\s*)(?:shareholders|registered_activities|office_address|bank_details)(?:\s*,|$)/u,
  );
  assert.doesNotMatch(companySelect.name, /encrypted|_hash/u);
  assert.deepEqual(
    supabase.calls.filter((call) => call.kind === 'rpc'),
    [
      {
        kind: 'rpc',
        name: 'evaluate_company_activation_readiness',
        value: { p_company_id: companyId },
      },
    ],
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
