import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const actorProfileId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const companyId = '33333333-3333-4333-8333-333333333333';

const sections = [
  { section_key: 'legal', status: 'complete', completed_at: '2026-08-21T09:00:00Z' },
  { section_key: 'shareholders', status: 'complete', completed_at: '2026-08-21T09:01:00Z' },
  { section_key: 'activities', status: 'complete', completed_at: '2026-08-21T09:02:00Z' },
  { section_key: 'office', status: 'incomplete', completed_at: null },
  { section_key: 'establishment', status: 'incomplete', completed_at: null },
  { section_key: 'bank', status: 'incomplete', completed_at: null },
];

const aggregate = {
  company_id: companyId,
  tenant_id: tenantId,
  company_name: 'Acme Trading LLC',
  display_name: null,
  company_status: 'onboarding',
  jurisdiction_type: 'mainland',
  licensing_authority: 'Dubai DET',
  legal_structure: 'llc',
  trade_license_no: 'DET-123',
  license_expiry: '2027-08-21',
  establishment_card_last4: '9876',
  establishment_card_expiry: '2027-08-21',
  onboarding_status: 'in_progress',
  onboarding_version: 7,
  shareholders: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'individual',
      full_name: 'Aisha Noor',
      nationality_code: 'AE',
      passport_masked: '•••• 4567',
      legal_name: null,
      country_of_incorporation: null,
      registration_masked: null,
      ownership_percent: '60.0000',
      sort_order: 0,
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      kind: 'company',
      full_name: null,
      nationality_code: null,
      passport_masked: null,
      legal_name: 'Parent Holdings Ltd',
      country_of_incorporation: 'GB',
      registration_masked: '•••• 9988',
      ownership_percent: '40.0000',
      sort_order: 1,
    },
  ],
  activities: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      activity_code: 'CONSULTING',
      activity_name: 'Management consulting',
      authority_name: 'Dubai DET',
      is_primary: true,
      sort_order: 0,
    },
  ],
  office: {
    office_type: 'physical',
    address_line_1: 'Office 10',
    address_line_2: null,
    area: 'Business Bay',
    city: 'Dubai',
    emirate: 'Dubai',
    postal_code: null,
    country_code: 'AE',
    provider_name: null,
    lease_reference: 'EJARI-123',
    lease_expiry: '2027-08-21',
  },
  bank: {
    bank_name: 'Example Bank',
    branch_name: null,
    account_holder_name: 'Acme Trading LLC',
    currency_code: 'AED',
    swift_bic_masked: '•••• AEAD',
    iban_masked: '•••• 1234',
    account_number_masked: null,
  },
  sections,
  requirements: [
    { code: 'BANK_SECTION_INCOMPLETE', section: 'bank', state: 'blocked' },
    { code: 'OFFICE_SECTION_INCOMPLETE', section: 'office', state: 'blocked' },
  ],
};

type RpcResult = { data: unknown; error: { message?: string } | null };

function fakeRpc(result: RpcResult) {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      async rpc(name: string, parameters: Record<string, unknown>) {
        calls.push({ name, parameters });
        return result;
      },
    },
  };
}

test('aggregate loader returns one authorized, ordered, masked onboarding snapshot', async () => {
  const { readCompanyOnboarding } = await import('./company-onboarding');
  const rpc = fakeRpc({ data: aggregate, error: null });

  const result = await readCompanyOnboarding(
    { actorProfileId, tenantId, companyId },
    { supabase: rpc.client as never },
  );

  assert.equal(rpc.calls.length, 1);
  assert.deepEqual(rpc.calls[0], {
    name: 'read_company_onboarding',
    parameters: {
      p_actor_id: actorProfileId,
      p_tenant_id: tenantId,
      p_company_id: companyId,
    },
  });
  assert.equal(result?.shareholders[0]?.sortOrder, 0);
  assert.equal(result?.activities[0]?.activityCode, 'CONSULTING');
  assert.equal(result?.establishmentCardMasked, '•••• 9876');
  assert.equal(result?.bank?.swiftBicMasked, '•••• AEAD');
  assert.deepEqual(result?.sectionProgress, {
    legal: { status: 'complete', completedAt: '2026-08-21T09:00:00Z' },
    shareholders: { status: 'complete', completedAt: '2026-08-21T09:01:00Z' },
    activities: { status: 'complete', completedAt: '2026-08-21T09:02:00Z' },
    office: { status: 'incomplete', completedAt: null },
    establishment: { status: 'incomplete', completedAt: null },
    bank: { status: 'incomplete', completedAt: null },
  });
  assert.deepEqual(
    result?.requirements.map(({ code }) => code),
    ['OFFICE_SECTION_INCOMPLETE', 'BANK_SECTION_INCOMPLETE'],
  );
  assert.doesNotMatch(JSON.stringify(result), /encrypted|_hash|4567.*passport|9988.*registration/u);
});

test('aggregate loader accepts incomplete legacy/null values without inventing defaults', async () => {
  const { readCompanyOnboarding } = await import('./company-onboarding');
  const rpc = fakeRpc({
    data: {
      ...aggregate,
      display_name: null,
      jurisdiction_type: null,
      licensing_authority: null,
      legal_structure: null,
      trade_license_no: null,
      license_expiry: null,
      establishment_card_last4: null,
      establishment_card_expiry: null,
      shareholders: [],
      activities: [],
      office: null,
      bank: null,
    },
    error: null,
  });

  const result = await readCompanyOnboarding(
    { actorProfileId, tenantId, companyId },
    { supabase: rpc.client as never },
  );
  assert.equal(result?.licensingAuthority, null);
  assert.equal(result?.establishmentCardMasked, null);
  assert.deepEqual(result?.shareholders, []);
  assert.equal(result?.office, null);
  assert.equal(result?.bank, null);
});

test('aggregate loader fails closed for malformed scope, mismatched ownership, and response shapes', async () => {
  const { readCompanyOnboarding } = await import('./company-onboarding');
  const cases = [
    { ...aggregate, company_id: '44444444-4444-4444-8444-444444444444' },
    { ...aggregate, tenant_id: '44444444-4444-4444-8444-444444444444' },
    { ...aggregate, sections: sections.slice(1) },
    { ...aggregate, requirements: [{ code: 'UNKNOWN', section: 'bank', state: 'blocked' }] },
  ];
  for (const data of cases) {
    const rpc = fakeRpc({ data, error: null });
    assert.equal(
      await readCompanyOnboarding(
        { actorProfileId, tenantId, companyId },
        { supabase: rpc.client as never },
      ),
      null,
    );
  }

  const malformed = fakeRpc({ data: aggregate, error: null });
  assert.equal(
    await readCompanyOnboarding(
      { actorProfileId: 'bad', tenantId, companyId },
      { supabase: malformed.client as never },
    ),
    null,
  );
  assert.equal(malformed.calls.length, 0);
});

test('aggregate authorization failures return null and diagnostics never include source details', async () => {
  const { readCompanyOnboarding } = await import('./company-onboarding');
  const events: string[] = [];
  for (const message of [
    'FORBIDDEN wrong role',
    'ASSIGNMENT_NOT_FOUND released',
    'COMPANY_NOT_FOUND cross-company',
  ]) {
    const rpc = fakeRpc({ data: null, error: { message } });
    assert.equal(
      await readCompanyOnboarding(
        { actorProfileId, tenantId, companyId },
        { supabase: rpc.client as never, log: (event) => events.push(event) },
      ),
      null,
    );
  }
  assert.deepEqual(events, [
    'company-onboarding.read-failed',
    'company-onboarding.read-failed',
    'company-onboarding.read-failed',
  ]);
  assert.doesNotMatch(events.join(' '), /FORBIDDEN|ASSIGNMENT|COMPANY_NOT_FOUND/u);
});
