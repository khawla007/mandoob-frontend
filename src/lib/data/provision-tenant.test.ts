import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

import { ApiError } from '@/lib/errors';
import type { ProvisionCompanyDependencies } from './provision-tenant';

const subject = () => import('./provision-tenant');

const actorId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const companyId = '33333333-3333-4333-8333-333333333333';
const input = { companyName: 'Acme Trading LLC', slug: 'acme-trading', plan: 'starter' as const };

test('provisions tenant, company, and audit through one atomic actor-bound RPC', async () => {
  const { provisionTenant } = await subject();
  const calls: unknown[] = [];
  const dependencies: ProvisionCompanyDependencies = {
    provision: async (value) => {
      calls.push(value);
      return { data: { tenant_id: tenantId, company_id: companyId }, error: null };
    },
  };
  assert.deepEqual(await provisionTenant(input, actorId, dependencies), { tenantId, companyId });
  assert.deepEqual(calls, [{ ...input, actorId }]);
});

test('maps atomic conflicts and unexpected failures without provider details', async () => {
  const { provisionTenant } = await subject();
  for (const [code, expectedCode, status] of [
    ['23505', 'VALIDATION_FAILED', 409],
    ['42501', 'FORBIDDEN', 403],
    ['XX000', 'INTERNAL', 500],
  ] as const) {
    const dependencies: ProvisionCompanyDependencies = {
      provision: async () => ({ data: null, error: { code, message: 'database secret' } }),
    };
    await assert.rejects(
      () => provisionTenant(input, actorId, dependencies),
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === expectedCode &&
        error.status === status &&
        !error.message.includes('secret'),
    );
  }
});

test('rejects malformed RPC success payloads', async () => {
  const { provisionTenant } = await subject();
  await assert.rejects(
    () =>
      provisionTenant(input, actorId, {
        provision: async () => ({ data: { tenant_id: 'bad' }, error: null }),
      }),
    (error: unknown) => error instanceof ApiError && error.code === 'INTERNAL',
  );
});
