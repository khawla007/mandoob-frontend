import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const actorProfileId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const companyId = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';
const rowId = '55555555-5555-4555-8555-555555555555';

type RpcResult = { data: unknown; error: { message?: string } | null };

function fakeClient(results: RpcResult[]) {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  let index = 0;
  return {
    calls,
    client: {
      async rpc(name: string, parameters: Record<string, unknown>) {
        calls.push({ name, parameters });
        return results[index++];
      },
    },
  };
}

const command = { actorProfileId, tenantId, companyId, operationId, expectedVersion: 3 };
const sectionResult = (section: string) => ({
  company_id: companyId,
  section,
  section_status: 'complete',
  onboarding_status: 'in_progress',
  onboarding_version: 4,
});

test('legal, activities, and office wrappers normalize exact section RPC payloads', async () => {
  const mutations = await import('./company-onboarding-mutations');
  const rpc = fakeClient([
    { data: sectionResult('legal'), error: null },
    { data: sectionResult('activities'), error: null },
    { data: sectionResult('office'), error: null },
  ]);
  const dependencies = { client: rpc.client as never };

  await mutations.saveCompanyLegalSection(
    {
      ...command,
      completeSection: true,
      companyName: '  Acme   Trading LLC ',
      displayName: ' Acme ',
      jurisdictionType: 'mainland',
      licensingAuthority: ' Dubai   DET ',
      legalStructure: 'llc',
      tradeLicenseNo: ' det-123 ',
      licenseExpiry: '2028-08-21',
    },
    dependencies,
  );
  await mutations.saveCompanyActivitiesSection(
    {
      ...command,
      completeSection: true,
      activities: [
        {
          id: rowId,
          activityCode: ' consulting ',
          activityName: ' Management   consulting ',
          authorityName: ' Dubai   DET ',
          isPrimary: true,
          sortOrder: 0,
        },
      ],
    },
    dependencies,
  );
  await mutations.saveCompanyOfficeSection(
    {
      ...command,
      completeSection: true,
      officeType: 'virtual',
      addressLine1: '',
      addressLine2: '',
      area: '',
      city: ' Dubai ',
      emirate: ' Dubai ',
      postalCode: '',
      countryCode: 'AE',
      providerName: ' Fixture   Offices ',
      leaseReference: '',
      leaseExpiry: '',
    },
    dependencies,
  );

  assert.deepEqual(
    rpc.calls.map(({ name }) => name),
    [
      'save_company_legal_section',
      'save_company_activities_section',
      'save_company_office_section',
    ],
  );
  assert.deepEqual(rpc.calls[0]?.parameters.p_payload, {
    complete_section: true,
    company_name: 'Acme Trading LLC',
    display_name: 'Acme',
    jurisdiction_type: 'mainland',
    licensing_authority: 'Dubai DET',
    legal_structure: 'llc',
    trade_license_no: 'DET-123',
    license_expiry: '2028-08-21',
  });
  assert.deepEqual(rpc.calls[1]?.parameters.p_payload, {
    complete_section: true,
    activities: [
      {
        id: rowId,
        activity_code: 'CONSULTING',
        activity_name: 'Management consulting',
        authority_name: 'Dubai DET',
        is_primary: true,
        sort_order: 0,
      },
    ],
  });
  assert.deepEqual(rpc.calls[2]?.parameters.p_payload, {
    complete_section: true,
    office_type: 'virtual',
    address_line_1: '',
    address_line_2: '',
    area: '',
    city: 'Dubai',
    emirate: 'Dubai',
    postal_code: '',
    country_code: 'AE',
    provider_name: 'Fixture Offices',
    lease_reference: '',
    lease_expiry: '',
  });
  for (const { parameters } of rpc.calls) {
    assert.equal(parameters.p_actor_id, actorProfileId);
    assert.equal(parameters.p_tenant_id, tenantId);
    assert.equal(parameters.p_company_id, companyId);
    assert.equal(parameters.p_expected_onboarding_version, 3);
    assert.equal(parameters.p_operation_id, operationId);
    assert.match(String(parameters.p_payload_hash), /^[a-f0-9]{64}$/u);
  }
});

test('shareholder wrapper preserves IDs and encrypts protected variant identifiers', async () => {
  const mutations = await import('./company-onboarding-mutations');
  const { decrypt } = await import('@/lib/crypto/pii');
  const corporateId = '66666666-6666-4666-8666-666666666666';
  const rpc = fakeClient([
    { data: sectionResult('shareholders'), error: null },
    { data: sectionResult('shareholders'), error: null },
  ]);

  const result = await mutations.saveCompanyShareholdersSection(
    {
      ...command,
      completeSection: true,
      shareholders: [
        {
          id: rowId,
          kind: 'individual',
          fullName: ' Aisha   Noor ',
          nationalityCode: ' ae ',
          passportNumber: ' p-1234567 ',
          ownershipPercent: '60.0000',
          sortOrder: 0,
        },
        {
          id: corporateId,
          kind: 'company',
          legalName: ' Parent   Holdings ',
          countryOfIncorporation: ' gb ',
          registrationNumber: ' reg-9988 ',
          ownershipPercent: '40.0000',
          sortOrder: 1,
        },
      ],
    },
    { client: rpc.client as never },
  );

  const payload = rpc.calls[0]?.parameters.p_payload as {
    shareholders: Array<Record<string, unknown>>;
  };
  assert.equal(payload.shareholders[0]?.id, rowId);
  assert.equal(payload.shareholders[1]?.id, corporateId);
  assert.equal(decrypt(String(payload.shareholders[0]?.passport_no_encrypted)), 'P-1234567');
  assert.equal(payload.shareholders[0]?.passport_no_last4, '4567');
  assert.match(String(payload.shareholders[0]?.passport_no_hash), /^[a-f0-9]{64}$/u);
  assert.equal(decrypt(String(payload.shareholders[1]?.registration_no_encrypted)), 'REG-9988');
  assert.equal(payload.shareholders[1]?.registration_no_last4, '9988');
  assert.doesNotMatch(JSON.stringify(result), /P-1234567|REG-9988|v1:/u);

  await mutations.saveCompanyShareholdersSection(
    {
      ...command,
      completeSection: true,
      shareholders: [
        {
          id: rowId,
          kind: 'individual',
          fullName: 'Aisha Noor',
          nationalityCode: 'AE',
          passportNumber: '',
          ownershipPercent: '60.0000',
          sortOrder: 0,
        },
        {
          id: corporateId,
          kind: 'company',
          legalName: 'Parent Holdings',
          countryOfIncorporation: 'GB',
          registrationNumber: '',
          ownershipPercent: '40.0000',
          sortOrder: 1,
        },
      ],
    },
    { client: rpc.client as never },
  );
  const keep = rpc.calls[1]?.parameters.p_payload as {
    shareholders: Array<Record<string, unknown>>;
  };
  assert.equal(keep.shareholders[0]?.passport_no_encrypted, null);
  assert.equal(keep.shareholders[1]?.registration_no_encrypted, null);
});

test('establishment and bank wrappers encrypt replacements while blank identifiers mean keep', async () => {
  const mutations = await import('./company-onboarding-mutations');
  const { decrypt, createBlindIndex } = await import('@/lib/crypto/pii');
  const rpc = fakeClient([
    { data: sectionResult('establishment'), error: null },
    { data: sectionResult('bank'), error: null },
    { data: sectionResult('bank'), error: null },
    { data: sectionResult('establishment'), error: null },
    { data: sectionResult('bank'), error: null },
  ]);
  const dependencies = { client: rpc.client as never };

  await mutations.saveCompanyEstablishmentSection(
    {
      ...command,
      completeSection: true,
      establishmentCardNumber: ' est-123456 ',
      establishmentCardExpiry: '2028-08-21',
    },
    dependencies,
  );
  await mutations.saveCompanyBankSection(
    {
      ...command,
      completeSection: true,
      bankName: ' Example   Bank ',
      branchName: '',
      accountHolderName: ' Acme   Trading LLC ',
      currencyCode: 'AED',
      swiftBic: ' ebilaead ',
      iban: 'AE07 0331-2345 6789 0123 456',
      accountNumber: '',
    },
    dependencies,
  );
  await mutations.saveCompanyBankSection(
    {
      ...command,
      completeSection: true,
      bankName: ' Example   Bank ',
      branchName: '',
      accountHolderName: ' Acme   Trading LLC ',
      currencyCode: 'AED',
      swiftBic: ' ebilaead ',
      iban: 'AE07 0331-2345 6789 0123 456',
      accountNumber: '',
    },
    dependencies,
  );
  await mutations.saveCompanyBankSection(
    {
      ...command,
      completeSection: false,
      bankName: 'Example Bank',
      branchName: '',
      accountHolderName: 'Acme Trading LLC',
      currencyCode: 'AED',
      swiftBic: '',
      iban: '',
      accountNumber: '',
    },
    dependencies,
  );
  await mutations.saveCompanyEstablishmentSection(
    {
      ...command,
      completeSection: true,
      establishmentCardNumber: '',
      establishmentCardExpiry: '2028-08-21',
    },
    dependencies,
  );

  const establishment = rpc.calls[0]?.parameters.p_payload as Record<string, unknown>;
  assert.equal(decrypt(String(establishment.card_no_encrypted)), 'EST-123456');
  assert.equal(establishment.card_no_last4, '3456');
  assert.equal(
    establishment.card_no_hash,
    createBlindIndex('company-establishment-card:v1', 'EST-123456'),
  );

  const replacement = rpc.calls[1]?.parameters.p_payload as Record<string, unknown>;
  const normalizedIban = 'AE070331234567890123456';
  assert.equal(decrypt(String(replacement.iban_encrypted)), normalizedIban);
  assert.equal(replacement.iban_last4, '3456');
  assert.equal(replacement.iban_hash, createBlindIndex('company-bank-iban:v1', normalizedIban));
  assert.equal(replacement.account_number_encrypted, null);

  const replay = rpc.calls[2]?.parameters.p_payload as Record<string, unknown>;
  assert.notEqual(replacement.iban_encrypted, replay.iban_encrypted);
  assert.equal(rpc.calls[1]?.parameters.p_payload_hash, rpc.calls[2]?.parameters.p_payload_hash);

  const keep = rpc.calls[3]?.parameters.p_payload as Record<string, unknown>;
  assert.equal(keep.iban_encrypted, null);
  assert.equal(keep.iban_hash, null);
  assert.equal(keep.iban_last4, null);
  assert.equal(keep.account_number_encrypted, null);
  assert.equal(keep.swift_bic, null);

  const establishmentKeep = rpc.calls[4]?.parameters.p_payload as Record<string, unknown>;
  assert.equal(establishmentKeep.card_no_encrypted, null);
  assert.equal(establishmentKeep.card_no_hash, null);
  assert.equal(establishmentKeep.card_no_last4, null);
});

test('clear, reopen, submit, and activate wrappers use explicit sanitized payloads', async () => {
  const mutations = await import('./company-onboarding-mutations');
  const rpc = fakeClient([
    { data: { company_id: companyId, identifier: 'iban', onboarding_version: 4 }, error: null },
    {
      data: {
        company_id: companyId,
        section: 'bank',
        onboarding_status: 'in_progress',
        onboarding_version: 4,
      },
      error: null,
    },
    {
      data: { company_id: companyId, ready: false, requirements: [], onboarding_version: 3 },
      error: null,
    },
    {
      data: { company_id: companyId, activated: true, requirements: [], onboarding_version: 4 },
      error: null,
    },
  ]);
  const dependencies = { client: rpc.client as never };

  await mutations.clearCompanyBankIdentifier(
    {
      ...command,
      identifier: 'iban',
      companyNameConfirmation: ' Acme Trading LLC ',
      expectedCompanyName: 'Acme Trading LLC',
    },
    dependencies,
  );
  await mutations.reopenCompanyOnboardingSection(
    {
      ...command,
      section: 'bank',
      reason: ' Missing   evidence ',
      companyNameConfirmation: 'Acme Trading LLC',
      expectedCompanyName: 'Acme Trading LLC',
    },
    dependencies,
  );
  await mutations.submitCompanyOnboarding(command, dependencies);
  await mutations.activateCompanyOnboarding(command, dependencies);

  assert.deepEqual(
    rpc.calls.map(({ name, parameters }) => [name, parameters.p_payload]),
    [
      ['clear_company_bank_identifier', { identifier: 'iban' }],
      ['reopen_company_onboarding_section', { section: 'bank', reason: 'Missing evidence' }],
      ['submit_company_onboarding_for_activation', {}],
      ['activate_company_onboarding', {}],
    ],
  );
  assert.notEqual(
    rpc.calls[2]?.parameters.p_payload_hash,
    rpc.calls[3]?.parameters.p_payload_hash,
    'operation kind must domain-separate otherwise-identical payloads',
  );
});

test('all stable SQL domain errors map without leaking details and malformed results fail closed', async () => {
  const { saveCompanyLegalSection } = await import('./company-onboarding-mutations');
  const valid = {
    ...command,
    completeSection: true,
    companyName: 'Acme Trading LLC',
    displayName: '',
    jurisdictionType: 'mainland' as const,
    licensingAuthority: 'Dubai DET',
    legalStructure: 'llc',
    tradeLicenseNo: 'DET-123',
    licenseExpiry: '2028-08-21',
  };
  const expected = {
    ASSIGNMENT_NOT_FOUND: 'notFound',
    COMPANY_NOT_FOUND: 'notFound',
    FORBIDDEN: 'notFound',
    COMPANY_INACTIVE: 'inactive',
    STALE_ONBOARDING_VERSION: 'conflict',
    INVALID_SECTION_INPUT: 'validation',
    SECTION_NOT_COMPLETABLE: 'incomplete',
    ONBOARDING_NOT_SUBMITTABLE: 'invalidState',
    OPERATION_REUSED: 'operationConflict',
  } as const;

  for (const [message, code] of Object.entries(expected)) {
    const rpc = fakeClient([{ data: null, error: { message } }]);
    assert.deepEqual(await saveCompanyLegalSection(valid, { client: rpc.client as never }), {
      ok: false,
      code,
    });
  }

  const events: string[] = [];
  const unknown = fakeClient([{ data: null, error: { message: 'secret database detail' } }]);
  assert.deepEqual(
    await saveCompanyLegalSection(valid, {
      client: unknown.client as never,
      log: (event) => events.push(event),
    }),
    { ok: false, code: 'unexpected' },
  );
  const malformed = fakeClient([{ data: { company_id: 'wrong' }, error: null }]);
  assert.deepEqual(
    await saveCompanyLegalSection(valid, {
      client: malformed.client as never,
      log: (event) => events.push(event),
    }),
    { ok: false, code: 'unexpected' },
  );
  assert.deepEqual(events, [
    'company-onboarding.legal-save-failed',
    'company-onboarding.legal-save-invalid-result',
  ]);
  assert.doesNotMatch(events.join(' '), /secret database detail/u);
});

test('mutation module has no decrypt or reveal surface', async () => {
  const mutations = await import('./company-onboarding-mutations');
  const source = readFileSync(
    join(process.cwd(), 'src/lib/data/company-onboarding-mutations.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /\bdecrypt|reveal/iu);
  assert.deepEqual(
    Object.keys(mutations).filter((name) => /decrypt|reveal/iu.test(name)),
    [],
  );
});
