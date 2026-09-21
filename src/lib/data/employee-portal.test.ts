process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiError } from '@/lib/errors';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';
const COMPANY = '33333333-3333-4333-8333-333333333333';
const EMPLOYEE = '44444444-4444-4444-8444-444444444444';
const DOCUMENT = '55555555-5555-4555-8555-555555555555';
const VERSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const originalFetch = globalThis.fetch;

type Mod = typeof import('./employee-portal');
let mod: Mod | null = null;
async function load(): Promise<Mod> {
  if (!mod) mod = await import('./employee-portal');
  return mod;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('employee portal joins the exact company relation and exposes company-named fields', () => {
  const source = readFileSync(new URL('./employee-portal.ts', import.meta.url), 'utf8');
  assert.match(source, /company:company_profiles!employees_company_tenant_fk\(company_name\)/u);
  assert.doesNotMatch(source, new RegExp(`\\b${['cli', 'ents'].join('')}\\s*\\(`, 'u'));
  assert.doesNotMatch(source, /row\.clients|clients\?:/u);
});

test('legacy Employee identity loader masks decrypted identifiers before returning its display contract', () => {
  const source = readFileSync(new URL('./employee-portal.ts', import.meta.url), 'utf8');
  assert.match(source, /passportMasked:\s*maskEmployeeIdentifier/u);
  assert.match(source, /visaMasked:\s*maskEmployeeIdentifier/u);
  assert.match(source, /emiratesIdMasked:\s*maskEmployeeIdentifier/u);
  assert.doesNotMatch(
    source,
    /passportNo:\s*decryptOptional|visaNo:\s*decryptOptional|emiratesId:\s*decryptOptional/u,
  );
});

test('legacy Employee loader does not request phone or email for portal display', () => {
  const source = readFileSync(new URL('./employee-portal.ts', import.meta.url), 'utf8');
  const employeeSelect = source.slice(
    source.indexOf(".from('employees')"),
    source.indexOf('.maybeSingle()', source.indexOf(".from('employees')")),
  );
  assert.doesNotMatch(employeeSelect, /\bemail\b|\bphone\b/u);
});

test('employee portal binds document reads through tenant, company, employee, and version', () => {
  const source = readFileSync(new URL('./employee-portal.ts', import.meta.url), 'utf8');
  assert.match(
    source,
    /\.from\('documents'\)[\s\S]*?\.eq\('tenant_id', tenantId\)[\s\S]*?\.eq\('company_id', employee\.company_id\)[\s\S]*?\.eq\('employee_id', employee\.id\)/u,
  );
  assert.match(
    source,
    /document:documents!document_versions_document_id_fkey!inner\(id, tenant_id, company_id, employee_id\)[\s\S]*?doc\.company_id !== employee\.company_id/u,
  );
  const signer = source.slice(
    source.indexOf('export async function getEmployeeDocumentSignedUrl'),
    source.indexOf('export async function getEmployeeNotificationPreferences'),
  );
  assert.doesNotMatch(signer, /storage_path|createSignedUrl/u);
  assert.match(signer, /signDocumentAccess/u);
});

test('employee signing forwards authoritative ownership and returns the exact DAL expiry', async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/rest/v1/employees')) {
      return Response.json({
        id: EMPLOYEE,
        tenant_id: TENANT,
        company_id: COMPANY,
        profile_id: ACTOR,
        name: 'Employee',
        nationality: null,
        passport_no_encrypted: null,
        visa_no_encrypted: null,
        visa_expiry: null,
        emirates_id_encrypted: null,
        eid_expiry: null,
        status: 'active',
        company: { company_name: 'Acme' },
      });
    }
    if (url.includes('/rest/v1/document_versions')) {
      return Response.json({
        id: VERSION,
        tenant_id: TENANT,
        document: {
          id: DOCUMENT,
          tenant_id: TENANT,
          company_id: COMPANY,
          employee_id: EMPLOYEE,
        },
      });
    }
    throw new Error('legacy direct provider signing was reached');
  }) as typeof fetch;
  const received: unknown[] = [];
  const { getEmployeeDocumentSignedUrl } = await load();
  const result = await getEmployeeDocumentSignedUrl(
    ACTOR,
    TENANT,
    VERSION.toUpperCase(),
    async (input) => {
      received.push(input);
      return {
        url: 'https://storage.test/signed',
        expiresAt: '2026-08-14T12:03:47.000Z',
      };
    },
  );

  assert.deepEqual(result, {
    url: 'https://storage.test/signed',
    expiresAt: '2026-08-14T12:03:47.000Z',
  });
  assert.deepEqual(received, [
    {
      actorId: ACTOR,
      tenantId: TENANT,
      companyId: COMPANY,
      documentId: DOCUMENT,
      versionId: VERSION,
      lifetimeSeconds: 300,
    },
  ]);
  assert.equal(calls.filter((url) => url.includes('/rest/v1/document_versions')).length, 1);
  assert.equal(
    new URL(calls.find((url) => url.includes('/rest/v1/document_versions')) ?? '').searchParams.get(
      'id',
    ),
    `eq.${VERSION}`,
  );
  assert.equal(
    calls.some((url) => url.includes('/storage/v1/object/sign/')),
    false,
  );
});

test('daysUntilExpiry is deterministic from an explicit today date', async () => {
  const { daysUntilExpiry } = await load();
  assert.equal(daysUntilExpiry('2026-06-09', new Date('2026-05-10T12:00:00Z')), 30);
  assert.equal(daysUntilExpiry('2026-05-09', new Date('2026-05-10T12:00:00Z')), -1);
  assert.equal(daysUntilExpiry(null, new Date('2026-05-10T12:00:00Z')), null);
});

test('expiryBucket labels missing, expired, critical, soon, and ok windows', async () => {
  const { expiryBucket } = await load();
  assert.equal(expiryBucket(null), 'missing');
  assert.equal(expiryBucket(-1), 'expired');
  assert.equal(expiryBucket(10), 'critical');
  assert.equal(expiryBucket(60), 'soon');
  assert.equal(expiryBucket(120), 'ok');
});

test('assertOwnedActiveEmployee rejects cross-tenant access', async () => {
  const { assertOwnedActiveEmployee } = await load();
  assert.throws(
    () =>
      assertOwnedActiveEmployee(
        {
          id: 'emp-1',
          tenant_id: 'tenant-a',
          profile_id: 'profile-1',
          status: 'active',
        },
        'profile-1',
        'tenant-b',
      ),
    (err) => err instanceof ApiError && err.code === 'FORBIDDEN',
  );
});

test('assertOwnedActiveEmployee rejects another employee profile', async () => {
  const { assertOwnedActiveEmployee } = await load();
  assert.throws(
    () =>
      assertOwnedActiveEmployee(
        {
          id: 'emp-1',
          tenant_id: 'tenant-a',
          profile_id: 'profile-2',
          status: 'active',
        },
        'profile-1',
        'tenant-a',
      ),
    (err) => err instanceof ApiError && err.code === 'FORBIDDEN',
  );
});

test('assertOwnedActiveEmployee rejects inactive employees', async () => {
  const { assertOwnedActiveEmployee } = await load();
  assert.throws(
    () =>
      assertOwnedActiveEmployee(
        {
          id: 'emp-1',
          tenant_id: 'tenant-a',
          profile_id: 'profile-1',
          status: 'terminated',
        },
        'profile-1',
        'tenant-a',
      ),
    (err) => err instanceof ApiError && err.code === 'FORBIDDEN',
  );
});
