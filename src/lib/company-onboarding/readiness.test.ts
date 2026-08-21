import assert from 'node:assert/strict';
import test from 'node:test';

const sectionKeys = ['legal', 'shareholders', 'activities', 'office', 'establishment', 'bank'];
const onboardingStatuses = ['not_started', 'in_progress', 'ready_for_activation', 'completed'];
const sectionStatuses = ['incomplete', 'complete'];
const readinessStates = ['missing', 'invalid', 'expired', 'blocked'];
const readinessCodes = [
  'LEGAL_SECTION_INCOMPLETE',
  'LEGAL_NAME_MISSING',
  'JURISDICTION_TYPE_MISSING',
  'LICENSING_AUTHORITY_MISSING',
  'LEGAL_STRUCTURE_MISSING',
  'TRADE_LICENSE_MISSING',
  'LICENSE_EXPIRY_MISSING',
  'LICENSE_EXPIRED',
  'SHAREHOLDERS_SECTION_INCOMPLETE',
  'SHAREHOLDER_MISSING',
  'OWNERSHIP_TOTAL_NOT_100',
  'ACTIVITIES_SECTION_INCOMPLETE',
  'ACTIVITY_MISSING',
  'PRIMARY_ACTIVITY_MISSING',
  'OFFICE_SECTION_INCOMPLETE',
  'OFFICE_TYPE_MISSING',
  'OFFICE_ADDRESS_MISSING',
  'OFFICE_LEASE_REFERENCE_MISSING',
  'OFFICE_LEASE_EXPIRY_MISSING',
  'OFFICE_LEASE_EXPIRED',
  'ESTABLISHMENT_SECTION_INCOMPLETE',
  'ESTABLISHMENT_CARD_MISSING',
  'ESTABLISHMENT_CARD_EXPIRY_MISSING',
  'ESTABLISHMENT_CARD_EXPIRED',
  'BANK_SECTION_INCOMPLETE',
  'BANK_ACCOUNT_MISSING',
  'ACTIVE_VERIFIED_PRO_ASSIGNMENT_MISSING',
  'TENANT_NOT_ACTIVATABLE',
] as const;

test('company onboarding exports the complete stable contract', async () => {
  const contracts = await import('./contracts');

  assert.deepEqual(contracts.COMPANY_ONBOARDING_SECTION_KEYS, sectionKeys);
  assert.deepEqual(contracts.COMPANY_ONBOARDING_STATUSES, onboardingStatuses);
  assert.deepEqual(contracts.COMPANY_ONBOARDING_SECTION_STATUSES, sectionStatuses);
  assert.deepEqual(contracts.COMPANY_ONBOARDING_READINESS_STATES, readinessStates);
  assert.deepEqual(contracts.COMPANY_ONBOARDING_READINESS_CODES, readinessCodes);
});

test('readiness parser accepts every exact code and preserves authoritative order', async () => {
  const { parseCompanyReadinessRequirements } = await import('./readiness');
  const rows = readinessCodes.map((code, index) => ({
    code,
    section:
      index < 8
        ? 'legal'
        : index < 11
          ? 'shareholders'
          : index < 14
            ? 'activities'
            : index < 20
              ? 'office'
              : index < 24
                ? 'establishment'
                : index < 26
                  ? 'bank'
                  : index === 26
                    ? 'assignment'
                    : 'workspace',
    state:
      code === 'ACTIVE_VERIFIED_PRO_ASSIGNMENT_MISSING'
        ? 'blocked'
        : code === 'OWNERSHIP_TOTAL_NOT_100' || code === 'PRIMARY_ACTIVITY_MISSING'
          ? 'invalid'
          : code.endsWith('_EXPIRED')
            ? 'expired'
            : code.endsWith('_MISSING')
              ? 'missing'
              : code.includes('INCOMPLETE') || code === 'TENANT_NOT_ACTIVATABLE'
                ? 'blocked'
                : 'invalid',
  }));

  assert.deepEqual(parseCompanyReadinessRequirements([...rows].reverse()), rows);
});

test('readiness parser rejects unknown or malformed database responses', async () => {
  const { CompanyReadinessResponseError, parseCompanyReadinessRequirements } =
    await import('./readiness');

  for (const rows of [
    [{ code: 'NEW_DATABASE_CODE', section: 'legal', state: 'missing' }],
    [{ code: 'LEGAL_NAME_MISSING', section: 'bank', state: 'missing' }],
    [{ code: 'LEGAL_NAME_MISSING', section: 'legal', state: 'new_state' }],
    [{ code: 'LEGAL_NAME_MISSING', section: 'legal' }],
    null,
  ]) {
    assert.throws(
      () => parseCompanyReadinessRequirements(rows),
      (error: unknown) =>
        error instanceof CompanyReadinessResponseError &&
        error.code === 'READINESS_RESPONSE_INVALID',
    );
  }
});

test('readiness parser rejects duplicate requirement codes', async () => {
  const { parseCompanyReadinessRequirements } = await import('./readiness');
  const row = { code: 'LEGAL_NAME_MISSING', section: 'legal', state: 'missing' };
  assert.throws(() => parseCompanyReadinessRequirements([row, row]), {
    message: 'READINESS_RESPONSE_INVALID',
  });
});
