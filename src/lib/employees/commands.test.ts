import assert from 'node:assert/strict';
import test from 'node:test';
import { P308Error } from '@/lib/p308/rpc';
import { createEmployee, setEmployeeStatus, updateEmployee, updateEmployeeSelf } from './commands';

const actor = {
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
};
const op = '44444444-4444-4444-8444-444444444444';
let nonce = 0;
const crypto = {
  encrypt: (value: string) => `enc:${(nonce += 1)}:${value.length}`,
  hashPassport: () => 'a'.repeat(64),
  blind: (domain: string, value: string) => `blind(${domain.length}:${value.length})`,
};

function fakeClient(result: { data?: unknown; error?: unknown } = {}) {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  return {
    calls,
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calls.push({ fn, params });
      return {
        data: result.data ?? { employee_id: 'e', version: 1, replayed: false },
        error: result.error ?? null,
      };
    },
  };
}

test('create seals identifiers and hashes intent without plaintext or randomized ciphertext', async () => {
  const client = fakeClient();
  const input = { operation_id: op, name: 'Alpha', passport_no: 'P1234567', email: '' as never };
  await createEmployee(client, actor, input, crypto);
  await createEmployee(client, actor, input, crypto);
  const [first, second] = client.calls;
  assert.equal(first.fn, 'p308_create_employee');
  assert.equal(first.params.p_company_id, actor.companyId);
  assert.equal(first.params.p_payload_hash, second.params.p_payload_hash);
  assert.notDeepEqual(first.params.p_employee, second.params.p_employee);
  const serialized = JSON.stringify(first.params);
  assert.equal(serialized.includes('P1234567'), false);
  assert.deepEqual((first.params.p_employee as Record<string, unknown>).passport_no_last4, '4567');
  assert.equal((first.params.p_employee as Record<string, unknown>).email, null);
});

test('update/status/self send versioned parameters', async () => {
  const client = fakeClient();
  await updateEmployee(
    client,
    actor,
    {
      operation_id: op,
      employee_id: actor.actorId,
      expected_version: 4,
      patch: { job_title: 'Lead' },
    },
    crypto,
  );
  await setEmployeeStatus(client, actor, {
    operation_id: op,
    employee_id: actor.actorId,
    expected_version: 5,
    status: 'inactive',
  });
  await updateEmployeeSelf(client, actor, {
    operation_id: op,
    expected_version: 2,
    renewal_reminders_enabled: false,
  });
  assert.equal(client.calls[0].params.p_expected_version, 4);
  assert.deepEqual(client.calls[0].params.p_patch, { job_title: 'Lead' });
  assert.equal(client.calls[1].params.p_status, 'inactive');
  assert.deepEqual(client.calls[2].params.p_patch, { renewal_reminders_enabled: false });
  assert.equal('p_company_id' in client.calls[2].params, false);
});

test('database errors surface as typed non-disclosing failures', async () => {
  const client = fakeClient({ error: { code: 'P0001', message: 'EMPLOYEE_PASSPORT_DUPLICATE' } });
  await assert.rejects(
    createEmployee(client, actor, { operation_id: op, name: 'Alpha' }, crypto),
    (error: unknown) =>
      error instanceof P308Error &&
      error.code === 'EMPLOYEE_PASSPORT_DUPLICATE' &&
      error.status === 409,
  );
});
