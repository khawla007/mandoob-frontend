import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import {
  REGISTRATION_STAGE_CODES,
  VISA_MILESTONE_CODES,
  validateRegistrationStages,
  validateVisaPerson,
} from './contracts';

type Result = { data: unknown; error: { message?: string; code?: string } | null };

function fakeSupabase(result: Result) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(result);
    },
  };
}

const proActor = {
  role: 'pro' as const,
  actorId: '44444444-4444-4444-8444-444444444444',
  tenantId: '55555555-5555-4555-8555-555555555555',
  companyId: '11111111-1111-4111-8111-111111111111',
};
const registrationId = '66666666-6666-4666-8666-666666666666';
const serviceCaseId = '77777777-7777-4777-8777-777777777777';
const generatedAt = '2026-09-23T10:00:00.000Z';

const proRead = {
  registrationId,
  serviceCaseId,
  status: 'in_progress',
  currentStage: 'visa_processing',
  registrationVersion: 5,
  startedAt: '2026-09-20T00:00:00.000Z',
  completedAt: null,
  // Only the first four stages are present + visa in progress; the adapter must
  // backfill bank_account and completed as not_started, in fixed order.
  stages: [
    {
      code: 'application_submitted',
      ordinal: 1,
      status: 'completed',
      startedAt: '2026-09-20T00:00:00.000Z',
      completedAt: '2026-09-20T01:00:00.000Z',
    },
    {
      code: 'initial_approval',
      ordinal: 2,
      status: 'completed',
      startedAt: null,
      completedAt: null,
    },
    {
      code: 'name_reservation',
      ordinal: 3,
      status: 'completed',
      startedAt: null,
      completedAt: null,
    },
    {
      code: 'license_issuance',
      ordinal: 4,
      status: 'completed',
      startedAt: null,
      completedAt: null,
    },
    {
      code: 'visa_processing',
      ordinal: 5,
      status: 'in_progress',
      startedAt: null,
      completedAt: null,
    },
  ],
  documents: [
    {
      linkId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      stageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      documentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      documentVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      role: 'trade_license',
      label: 'Trade License',
      mimeType: 'application/pdf',
      reviewStatus: 'approved',
      linkedAt: '2026-09-21T00:00:00.000Z',
    },
  ],
  visaPeople: [
    {
      visaPersonId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      displayName: 'Aisha Khan',
      personKind: 'shareholder',
      visaKind: 'investor',
      status: 'in_progress',
      currentStage: 'status_adjustment',
      visaVersion: 3,
    },
  ],
  generatedAt,
};

test('pro loader backfills all seven stages in fixed order and passes the validator', async () => {
  const { loadRegistrationPresentation } = await import('./db-adapter');
  const supabase = fakeSupabase({ data: proRead, error: null });
  const state = await loadRegistrationPresentation(registrationId, proActor, { supabase });
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  assert.equal(state.generatedAt, generatedAt);
  assert.deepEqual(
    state.value.stages.map((s) => s.code),
    [...REGISTRATION_STAGE_CODES],
  );
  assert.equal(state.value.stages[5].status, 'not_started'); // bank_account backfilled
  assert.equal(state.value.stages[6].status, 'not_started'); // completed backfilled
  // Round-trips the contract validator with no throw.
  assert.doesNotThrow(() => validateRegistrationStages(state.value.stages));
  assert.equal(supabase.calls[0].name, 'read_pro_registration_workflow');
});

test('visa people expand into six ordered milestones and map in_progress -> active', async () => {
  const { loadRegistrationPresentation } = await import('./db-adapter');
  const supabase = fakeSupabase({ data: proRead, error: null });
  const state = await loadRegistrationPresentation(registrationId, proActor, { supabase });
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  const [person] = state.value.visaPeople;
  assert.equal(person.status, 'active');
  assert.deepEqual(
    person.stages.map((s) => s.code),
    [...VISA_MILESTONE_CODES],
  );
  // current_stage = status_adjustment (ordinal 3): 1..2 completed, 3 active, 4..6 not_started
  assert.deepEqual(
    person.stages.map((s) => s.status),
    ['completed', 'completed', 'active', 'not_started', 'not_started', 'not_started'],
  );
  assert.doesNotThrow(() => validateVisaPerson(person));
});

test('a cancelled visa person yields a validator-safe milestone chain', async () => {
  const { loadRegistrationPresentation } = await import('./db-adapter');
  const cancelledRead = {
    ...proRead,
    visaPeople: [
      {
        visaPersonId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        displayName: 'Cancelled Person',
        personKind: 'other',
        visaKind: 'family',
        status: 'cancelled',
        currentStage: 'entry_permit',
        visaVersion: 2,
      },
    ],
  };
  const supabase = fakeSupabase({ data: cancelledRead, error: null });
  const state = await loadRegistrationPresentation(registrationId, proActor, { supabase });
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  const [person] = state.value.visaPeople;
  assert.equal(person.status, 'cancelled');
  assert.doesNotThrow(() => validateVisaPerson(person));
});

test('customer loader redacts documents to approved-only and pro/customer differ', async () => {
  const { loadRegistrationPresentation } = await import('./db-adapter');
  const customerRead = {
    registrationId,
    status: 'in_progress',
    currentStage: 'visa_processing',
    completedStages: 4,
    totalStages: 7,
    generatedAt,
    stages: proRead.stages.map((s) => ({
      code: s.code,
      ordinal: s.ordinal,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    })),
    documents: [
      {
        evidenceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        documentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        stageCode: 'license_issuance',
        role: 'trade_license',
        label: 'Trade License',
        mimeType: 'application/pdf',
        linkedAt: '2026-09-21T00:00:00.000Z',
      },
    ],
    visaProgress: [
      {
        displayName: 'Aisha Khan',
        personKind: 'shareholder',
        visaKind: 'investor',
        status: 'in_progress',
        currentStage: 'status_adjustment',
      },
    ],
  };
  const supabase = fakeSupabase({ data: customerRead, error: null });
  const state = await loadRegistrationPresentation(
    registrationId,
    { role: 'customer', actorId: proActor.actorId },
    { supabase },
  );
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  assert.equal(supabase.calls[0].name, 'read_customer_registration_progress');
  assert.equal(state.value.documents[0].reviewStatus, 'approved');
  assert.doesNotThrow(() => validateRegistrationStages(state.value.stages));
  assert.doesNotThrow(() => validateVisaPerson(state.value.visaPeople[0]));
});

// The employee visa RPC returns EXACTLY the actor's own visa person, keyed by
// the registration_visa_people row id (not an ordinal). These fixtures model the
// wrapped single-person receipt for two different employees in the same company.
const OWN_VISA_PERSON_ID = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
const OTHER_VISA_PERSON_ID = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const employeeActor = {
  role: 'employee' as const,
  actorId: proActor.actorId,
  tenantId: proActor.tenantId,
  companyId: proActor.companyId,
};

const ownEmployeeRead = {
  registrationId,
  generatedAt,
  visaPerson: {
    visaPersonId: OWN_VISA_PERSON_ID,
    displayName: 'Own Employee',
    personKind: 'employee',
    visaKind: 'employee',
    status: 'in_progress',
    currentStage: 'documents_ready',
  },
};

const otherEmployeeRead = {
  registrationId,
  generatedAt,
  visaPerson: {
    visaPersonId: OTHER_VISA_PERSON_ID,
    displayName: 'Second Employee',
    personKind: 'employee',
    visaKind: 'employee',
    status: 'blocked',
    currentStage: 'entry_permit',
  },
};

test('SECURITY: employee visa read yields ONLY the actor own person keyed by the row id', async () => {
  const { loadVisaPresentation } = await import('./db-adapter');
  const supabase = fakeSupabase({ data: ownEmployeeRead, error: null });
  const state = await loadVisaPresentation(registrationId, employeeActor, { supabase });
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  assert.equal(state.value.length, 1);
  // Key is the registration_visa_people row id, NOT `${registrationId}:visa:0`.
  assert.equal(state.value[0].key, OWN_VISA_PERSON_ID);
  assert.notEqual(state.value[0].key, `${registrationId}:visa:0`);
  assert.equal(state.value[0].displayName, 'Own Employee');
  // Employee path routes through the dedicated employee-scoped RPC.
  assert.equal(supabase.calls[0].name, 'read_employee_visa_person');
  assert.equal(supabase.calls[0].args.p_actor_id, proActor.actorId);
  assert.equal(supabase.calls[0].args.p_registration_id, registrationId);
});

test('SECURITY: a DIFFERENT employee sees a DIFFERENT (their own) visa person', async () => {
  const { loadVisaPresentation } = await import('./db-adapter');
  const supabase = fakeSupabase({ data: otherEmployeeRead, error: null });
  const state = await loadVisaPresentation(registrationId, employeeActor, { supabase });
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  assert.equal(state.value.length, 1);
  assert.equal(state.value[0].key, OTHER_VISA_PERSON_ID);
  assert.equal(state.value[0].displayName, 'Second Employee');
  // The two employees resolve to distinct own persons — no shared person[0].
  assert.notEqual(OTHER_VISA_PERSON_ID, OWN_VISA_PERSON_ID);
});

test('employee with no own visa person fails closed to visa-unavailable', async () => {
  const { loadVisaPresentation } = await import('./db-adapter');
  // The RPC raises REGISTRATION_NOT_FOUND when the actor has no own visa person.
  const supabase = fakeSupabase({
    data: null,
    error: { message: 'REGISTRATION_NOT_FOUND', code: 'P0001' },
  });
  const state = await loadVisaPresentation(registrationId, employeeActor, { supabase });
  assert.deepEqual(state, { kind: 'unavailable', reason: 'visa_contract_unavailable' });
});

test('a forbidden/not-found source fails closed to contract-unavailable', async () => {
  const { loadRegistrationPresentation, loadVisaPresentation } = await import('./db-adapter');
  const supabase = fakeSupabase({ data: null, error: { message: 'FORBIDDEN', code: '42501' } });
  const state = await loadRegistrationPresentation(registrationId, proActor, { supabase });
  assert.deepEqual(state, {
    kind: 'unavailable',
    reason: 'registration_contract_unavailable',
  });

  const supabase2 = fakeSupabase({
    data: null,
    error: { message: 'REGISTRATION_NOT_FOUND', code: 'P0001' },
  });
  const visa = await loadVisaPresentation(registrationId, proActor, { supabase: supabase2 });
  assert.deepEqual(visa, { kind: 'unavailable', reason: 'visa_contract_unavailable' });
});

test('an unexpected source error surfaces as source_error', async () => {
  const { loadRegistrationPresentation } = await import('./db-adapter');
  const supabase = fakeSupabase({ data: null, error: { message: 'boom', code: 'XX000' } });
  const state = await loadRegistrationPresentation(registrationId, proActor, { supabase });
  assert.deepEqual(state, { kind: 'error', code: 'source_error' });
});

test('the index loader returns empty for no ids and aggregates ready presentations', async () => {
  const { loadRegistrationIndex } = await import('./db-adapter');
  const empty = await loadRegistrationIndex([], proActor, {
    supabase: fakeSupabase({ data: null, error: null }),
  });
  assert.deepEqual(empty, { kind: 'empty' });

  const supabase = fakeSupabase({ data: proRead, error: null });
  const state = await loadRegistrationIndex([registrationId], proActor, { supabase });
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  assert.equal(state.value.length, 1);
});

const operatorContext = { role: 'operator' as const, actorId: proActor.actorId, actorAal: 'aal2' };

const adminIndexRow = {
  registrationId,
  tenantId: proActor.tenantId,
  companyId: proActor.companyId,
  companyName: 'Acme FZ',
  proName: 'Sara PRO',
  title: 'New LLC',
  status: 'in_progress',
  currentStage: 'application_submitted',
  currentStageStatus: 'blocked',
  completedStages: 1,
  totalStages: 7,
  registrationVersion: 2,
  updatedAt: generatedAt,
};

test('loadAdminRegistrationIndex maps ready summary rows with total/page/pageSize', async () => {
  const { loadAdminRegistrationIndex } = await import('./db-adapter');
  const supabase = fakeSupabase({
    data: { items: [adminIndexRow], total: 42, page: 2, pageSize: 20 },
    error: null,
  });
  const state = await loadAdminRegistrationIndex(
    operatorContext,
    { company: null, pro: null, stage: null, status: null, page: 2 },
    { supabase },
  );
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  assert.equal(state.total, 42);
  assert.equal(state.page, 2);
  assert.equal(state.pageSize, 20);
  assert.equal(state.value.length, 1);
  assert.equal(state.value[0].companyName, 'Acme FZ');
  assert.equal(state.value[0].currentStageStatus, 'blocked');
  assert.equal(supabase.calls[0].name, 'read_admin_registration_index');
  assert.equal(supabase.calls[0].args.p_actor_aal, 'aal2');
});

test('loadAdminRegistrationIndex returns empty with paging when there are no rows', async () => {
  const { loadAdminRegistrationIndex } = await import('./db-adapter');
  const supabase = fakeSupabase({
    data: { items: [], total: 0, page: 1, pageSize: 20 },
    error: null,
  });
  const state = await loadAdminRegistrationIndex(
    operatorContext,
    { company: null, pro: null, stage: null, status: null, page: 1 },
    { supabase },
  );
  assert.deepEqual(state, { kind: 'empty', page: 1, pageSize: 20 });
});

test('loadAdminRegistrationIndex fails closed to unavailable on a forbidden read', async () => {
  const { loadAdminRegistrationIndex } = await import('./db-adapter');
  const supabase = fakeSupabase({ data: null, error: { message: 'FORBIDDEN', code: '42501' } });
  const state = await loadAdminRegistrationIndex(
    operatorContext,
    { company: null, pro: null, stage: null, status: null, page: 1 },
    { supabase },
  );
  assert.deepEqual(state, { kind: 'unavailable', reason: 'registration_contract_unavailable' });
});

test('loadAdminRegistrationIndex surfaces an unexpected source error', async () => {
  const { loadAdminRegistrationIndex } = await import('./db-adapter');
  const supabase = fakeSupabase({ data: null, error: { message: 'boom', code: 'XX000' } });
  const state = await loadAdminRegistrationIndex(
    operatorContext,
    { company: null, pro: null, stage: null, status: null, page: 1 },
    { supabase },
  );
  assert.deepEqual(state, { kind: 'error', code: 'source_error' });
});

test('SECURITY: in a MULTI-person company the employee sees ONLY their own person, not person[0]', async () => {
  const { loadVisaPresentation } = await import('./db-adapter');
  // The company has several visa people. The employee-scoped RPC is keyed by the
  // actor's own employee_id, so it returns EXACTLY the actor's own person — even
  // when that person is not the first-created (person[0]) row. The old ordinal
  // heuristic would have surfaced person[0]; this must not.
  const supabase = fakeSupabase({ data: otherEmployeeRead, error: null });
  const state = await loadVisaPresentation(registrationId, employeeActor, { supabase });
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  // Exactly one person, and it is the actor's own (keyed by the row id).
  assert.equal(state.value.length, 1);
  assert.equal(state.value[0].key, OTHER_VISA_PERSON_ID);
  assert.equal(state.value[0].displayName, 'Second Employee');
  // No other person from the company leaked, and it is NOT the ordinal person[0].
  assert.equal(
    state.value.some((p) => p.displayName === 'Own Employee'),
    false,
  );
  assert.equal(
    state.value.some((p) => p.key === `${registrationId}:visa:0`),
    false,
  );
});
