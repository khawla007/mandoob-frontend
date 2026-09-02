import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveImportCompany } from './import-company-access';

const assigned = {
  id: 'company-server',
  tenantId: 'tenant-a',
  companyName: 'Server company',
  status: 'active' as const,
  tradeLicenseNo: null,
  jurisdiction: null,
  licenseExpiry: null,
  shareholderCount: 0,
  registeredActivityCount: 0,
  onboardingStatus: 'not_started' as const,
  onboardingVersion: 0,
  sectionProgress: {
    legal: 'incomplete' as const,
    shareholders: 'incomplete' as const,
    activities: 'incomplete' as const,
    office: 'incomplete' as const,
    establishment: 'incomplete' as const,
    bank: 'incomplete' as const,
  },
  readinessCodes: [],
  readinessState: 'data' as const,
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
};

test('import company is always derived from the current server-side assignment', async () => {
  const calls: string[][] = [];
  const result = await resolveImportCompany('pro-a', 'tenant-a', 'acme', async (...args) => {
    calls.push(args);
    return assigned;
  });

  assert.equal(result?.id, 'company-server');
  assert.deepEqual(calls, [['pro-a', 'acme']]);
});

test('a released or cross-tenant assignment denies import access', async () => {
  assert.equal(await resolveImportCompany('pro-a', 'tenant-a', 'acme', async () => null), null);
  assert.equal(
    await resolveImportCompany('pro-a', 'tenant-a', 'acme', async () => ({
      ...assigned,
      tenantId: 'tenant-b',
    })),
    null,
  );
});
