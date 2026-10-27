import assert from 'node:assert/strict';
import test from 'node:test';
import { openBankEvidence, reviewBankEvidence } from './bank-evidence-review';
import { financePayloadHash } from './repository';

const ids = {
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
  submissionId: '44444444-4444-4444-8444-444444444444',
  operationId: '55555555-5555-4555-8555-555555555555',
};

test('review sends operation identity, expected version/state, and stable payload hash', async () => {
  const calls: unknown[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => (
      calls.push({ name, args }),
      { data: { status: 'clean', version: 2, replayed: false }, error: null }
    ),
  };
  const input = {
    ...ids,
    expectedVersion: 1,
    expectedState: 'pending' as const,
    decision: 'clean' as const,
    note: null,
  };
  assert.deepEqual(await reviewBankEvidence(input, client as never), {
    ok: true,
    state: 'clean',
    version: 2,
    replayed: false,
  });
  const args = (calls[0] as { args: Record<string, unknown> }).args;
  assert.equal(args.p_operation_id, ids.operationId);
  assert.equal(args.p_expected_version, 1);
  assert.equal(args.p_expected_state, 'pending');
  assert.match(String(args.p_payload_hash), /^[a-f0-9]{64}$/u);
});

test('reviewer open delegates exact scope to short-lived signing without retaining URL', async () => {
  const calls: unknown[] = [];
  const result = await openBankEvidence(
    {
      actorId: ids.actorId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      submissionId: ids.submissionId,
      lifetimeSeconds: 60,
    },
    async (input) => (
      calls.push(input),
      { url: 'https://example.test/signed', expiresAt: '2026-09-22T09:21:00.000Z' }
    ),
  );
  assert.equal(result.url, 'https://example.test/signed');
  assert.deepEqual(calls[0], {
    actorId: ids.actorId,
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    submissionId: ids.submissionId,
    lifetimeSeconds: 60,
  });
});

test('rejection replay hash and RPC use the same normalized bounded reviewer reason', async () => {
  let args: Record<string, unknown> = {};
  const client = {
    rpc: async (_name: string, value: Record<string, unknown>) => {
      args = value;
      return { data: { status: 'rejected', version: 2, replayed: false }, error: null };
    },
  };
  const result = await reviewBankEvidence(
    {
      ...ids,
      expectedVersion: 1,
      expectedState: 'pending',
      decision: 'rejected',
      note: '  Account reference does not match  ',
    },
    client as never,
  );
  assert.equal(result.ok, true);
  assert.equal(args.p_note, 'Account reference does not match');
  assert.equal(
    args.p_payload_hash,
    financePayloadHash({
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      submissionId: ids.submissionId,
      expectedVersion: 1,
      expectedState: 'pending',
      decision: 'rejected',
      note: 'Account reference does not match',
    }),
  );
});
