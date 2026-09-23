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

test('employee scope drops documents and restricts to its own visa person key', async () => {
  const { loadVisaPresentation } = await import('./db-adapter');
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
    documents: [],
    visaProgress: [
      {
        displayName: 'Own Employee',
        personKind: 'employee',
        visaKind: 'employee',
        status: 'in_progress',
        currentStage: 'documents_ready',
      },
    ],
  };
  const supabase = fakeSupabase({ data: customerRead, error: null });
  const ownKey = `${registrationId}:visa:0`;
  const state = await loadVisaPresentation(
    registrationId,
    { role: 'employee', actorId: proActor.actorId, employeeVisaPersonKey: ownKey },
    { supabase },
  );
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') return;
  assert.equal(state.value.length, 1);
  assert.equal(state.value[0].key, ownKey);

  // A non-matching key redacts everyone out.
  const supabase2 = fakeSupabase({ data: customerRead, error: null });
  const empty = await loadVisaPresentation(
    registrationId,
    { role: 'employee', actorId: proActor.actorId, employeeVisaPersonKey: 'no-match' },
    { supabase: supabase2 },
  );
  assert.equal(empty.kind, 'ready');
  if (empty.kind !== 'ready') return;
  assert.equal(empty.value.length, 0);
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
