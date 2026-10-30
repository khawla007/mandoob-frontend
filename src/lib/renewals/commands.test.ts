import assert from 'node:assert/strict';
import test from 'node:test';
import {
  batchTransitionRenewals,
  createRenewal,
  transitionRenewal,
  updateRenewal,
} from './commands';

const actor = {
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
};
const op = '44444444-4444-4444-8444-444444444444';
const renewalId = '55555555-5555-4555-8555-555555555555';

function fakeClient() {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  return {
    calls,
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calls.push({ fn, params });
      return { data: { renewal_id: renewalId, version: 2, replayed: false }, error: null };
    },
  };
}

test('create nests costs in minor units and the company comes from the resolved actor', async () => {
  const client = fakeClient();
  await createRenewal(client, actor, {
    operation_id: op,
    type: 'investor_visa',
    label: 'Investor visa',
    due_date: '2027-01-01',
    government_fee_minor: 150000,
    currency: 'AED',
  });
  const { params } = client.calls[0];
  assert.equal(params.p_company_id, actor.companyId);
  assert.deepEqual(params.p_renewal, {
    type: 'investor_visa',
    label: 'Investor visa',
    due_date: '2027-01-01',
    costs: { government_fee_minor: 150000, currency: 'AED' },
  });
  assert.match(String(params.p_payload_hash), /^[a-f0-9]{64}$/u);
});

test('update, transition and batch forward versions, evidence and reasons', async () => {
  const client = fakeClient();
  await updateRenewal(client, actor, renewalId, {
    operation_id: op,
    expected_version: 3,
    blocker_code: null,
  });
  await transitionRenewal(client, actor, renewalId, {
    operation_id: op,
    expected_version: 4,
    to_stage: 'documents_submitted',
    evidence_document_ids: [renewalId],
  });
  await batchTransitionRenewals(client, actor, {
    operation_id: op,
    to_stage: 'cancelled',
    reason_code: 'duplicate_entry',
    items: [{ renewal_id: renewalId, expected_version: 5 }],
  });
  assert.deepEqual(client.calls[0].params.p_patch, { blocker_code: null });
  assert.equal(client.calls[1].params.p_expected_version, 4);
  assert.deepEqual(client.calls[1].params.p_evidence_document_ids, [renewalId]);
  assert.equal(client.calls[1].params.p_reason_code, null);
  assert.equal(client.calls[2].fn, 'p308_batch_transition_renewals');
  assert.equal(client.calls[2].params.p_reason_code, 'duplicate_entry');
});
