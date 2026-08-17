import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64');

const profileId = '11111111-1111-4111-8111-111111111111';
const scope = {
  employeeId: '22222222-2222-4222-8222-222222222222',
  tenantId: '33333333-3333-4333-8333-333333333333',
  companyId: '44444444-4444-4444-8444-444444444444',
};

test('employee self passport update derives and forwards only the authoritative live scope', async () => {
  const { updateEmployeeSelfPassport } = await import('./employee-self-passport');
  const calls: Record<string, unknown>[] = [];
  const result = await updateEmployeeSelfPassport(profileId, ' ab-123 ', {
    readScope: async () => scope,
    rpc: async (args) => {
      calls.push(args);
      return { data: scope.employeeId, error: null };
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0]?.p_expected_tenant_id, scope.tenantId);
  assert.equal(calls[0]?.p_expected_company_id, scope.companyId);
  assert.match(String(calls[0]?.p_passport_no_hash), /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(calls), /ab-123/i);
});

test('missing authorization and cross-company RPC conflicts fail closed', async () => {
  const { updateEmployeeSelfPassport } = await import('./employee-self-passport');
  assert.deepEqual(
    await updateEmployeeSelfPassport(profileId, 'P-1', { readScope: async () => null }),
    { ok: false, code: 'notFound' },
  );
  assert.deepEqual(
    await updateEmployeeSelfPassport(profileId, 'P-1', {
      readScope: async () => scope,
      rpc: async () => ({ data: null, error: { message: 'EMPLOYEE_SCOPE_MISMATCH' } }),
    }),
    { ok: false, code: 'notFound' },
  );
});

test('passport unique conflicts are sanitized to the stable duplicate result', async () => {
  const { updateEmployeeSelfPassport } = await import('./employee-self-passport');
  const diagnostics: string[] = [];
  const result = await updateEmployeeSelfPassport(profileId, 'P-1', {
    readScope: async () => scope,
    rpc: async () => ({
      data: null,
      error: { code: '23505', message: 'private hash and constraint detail' },
    }),
    log: (event) => diagnostics.push(event),
  });

  assert.deepEqual(result, { ok: false, code: 'duplicate' });
  assert.deepEqual(diagnostics, []);
  assert.doesNotMatch(JSON.stringify(result), /private|hash|constraint/);
});
