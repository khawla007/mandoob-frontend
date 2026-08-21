import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

const CREDENTIAL_ID = '11111111-1111-4111-8111-111111111111';
const PRICING_ID = '22222222-2222-4222-8222-222222222222';
const COMPENSATION_ID = '33333333-3333-4333-8333-333333333333';
const PRO_ID = '44444444-4444-4444-8444-444444444444';
const COMPANY_ID = '55555555-5555-4555-8555-555555555555';
const ACTOR_ID = '66666666-6666-4666-8666-666666666666';

test('parses the exact sanitized eligibility result', async () => {
  const { parseProAssignmentEligibility } = await import('./pro-eligibility');
  assert.deepEqual(
    parseProAssignmentEligibility({
      eligible: true,
      codes: [],
      verifiedCredentialId: CREDENTIAL_ID,
      pricingTermId: PRICING_ID,
      compensationTermId: COMPENSATION_ID,
    }),
    {
      eligible: true,
      codes: [],
      verifiedCredentialId: CREDENTIAL_ID,
      pricingTermId: PRICING_ID,
      compensationTermId: COMPENSATION_ID,
    },
  );
});

test('calls the evaluator with exact arguments and parses its result', async () => {
  const calls: unknown[] = [];
  const result = {
    eligible: true,
    codes: [],
    verifiedCredentialId: CREDENTIAL_ID,
    pricingTermId: PRICING_ID,
    compensationTermId: COMPENSATION_ID,
  };
  const { evaluateProAssignmentEligibility } = await import('./pro-eligibility');
  assert.deepEqual(
    await evaluateProAssignmentEligibility(PRO_ID, COMPANY_ID, {
      supabase: {
        async rpc(name: string, args: unknown) {
          calls.push({ name, args });
          return { data: result, error: null };
        },
      } as never,
    }),
    result,
  );
  assert.deepEqual(calls, [
    {
      name: 'evaluate_pro_assignment_eligibility',
      args: { p_pro_profile_id: PRO_ID, p_company_id: COMPANY_ID },
    },
  ]);
});

test('eligible selector is one bounded masked RPC and rejects unsafe output', async () => {
  const calls: unknown[] = [];
  const { listEligibleProsForCompany } = await import('./pro-eligibility');
  const rows = await listEligibleProsForCompany(COMPANY_ID, '  Aisha  ', 20, ACTOR_ID, {
    supabase: {
      async rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return {
          data: [
            {
              proProfileId: PRO_ID,
              fullName: 'Aisha PRO',
              designation: 'Public Relations Officer',
              department: null,
              eligibility: {
                eligible: true,
                codes: [],
                verifiedCredentialId: CREDENTIAL_ID,
                pricingTermId: PRICING_ID,
                compensationTermId: COMPENSATION_ID,
              },
            },
          ],
          error: null,
        };
      },
    } as never,
  });
  assert.equal(rows[0]?.proProfileId, PRO_ID);
  assert.doesNotMatch(JSON.stringify(rows), /identifier|cipher|hash|storagePath/u);
  assert.deepEqual(calls, [
    {
      name: 'list_eligible_pros_for_company',
      args: {
        p_actor_id: ACTOR_ID,
        p_company_id: COMPANY_ID,
        p_query: 'Aisha',
        p_limit: 20,
      },
    },
  ]);

  await assert.rejects(() => listEligibleProsForCompany(COMPANY_ID, '', 101, ACTOR_ID), /limit/u);
});

test('preserves deterministic eligibility code order and rejects unknown output', async () => {
  const { parseProAssignmentEligibility } = await import('./pro-eligibility');
  const parsed = parseProAssignmentEligibility({
    eligible: false,
    codes: ['PRO_CREDENTIAL_EXPIRED', 'PRICING_TERMS_MISSING'],
    verifiedCredentialId: null,
    pricingTermId: null,
    compensationTermId: null,
  });
  assert.deepEqual(parsed.codes, ['PRO_CREDENTIAL_EXPIRED', 'PRICING_TERMS_MISSING']);
  for (const invalid of [
    { ...parsed, codes: ['PRIVATE_DATABASE_ERROR'] },
    { ...parsed, codes: ['PRICING_TERMS_MISSING', 'PRO_CREDENTIAL_EXPIRED'] },
    { ...parsed, codes: ['PRO_CREDENTIAL_EXPIRED', 'PRO_CREDENTIAL_EXPIRED'] },
    { ...parsed, storagePath: 'private/path' },
    { ...parsed, eligible: 'yes' },
  ]) {
    assert.throws(() => parseProAssignmentEligibility(invalid), /eligibility/u);
  }
});
