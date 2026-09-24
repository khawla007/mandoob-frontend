import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

type Result = { data: unknown; error: { message?: string; code?: string } | null };

function fakeSupabase(results: Result[]) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let index = 0;
  return {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(results[index++]);
    },
  };
}

const actor = {
  actorId: '44444444-4444-4444-8444-444444444444',
  tenantId: '55555555-5555-4555-8555-555555555555',
  companyId: '11111111-1111-4111-8111-111111111111',
};
const registrationId = '66666666-6666-4666-8666-666666666666';
const serviceCaseId = '77777777-7777-4777-8777-777777777777';
const stageId = '88888888-8888-4888-8888-888888888888';
const operationId = '99999999-9999-4999-8999-999999999999';

test('createRegistration passes exact RPC args, a 64-hex payload hash, and returns the typed receipt', async () => {
  const { createRegistration } = await import('./registration-workflow');
  const supabase = fakeSupabase([
    {
      data: {
        registrationId,
        serviceCaseId,
        status: 'in_progress',
        currentStage: 'application_submitted',
        registrationVersion: 1,
        currentStageVersion: 1,
      },
      error: null,
    },
  ]);
  const receipt = await createRegistration(
    {
      companyId: actor.companyId,
      title: 'New LLC',
      priority: 'normal',
      dueAt: null,
      operationId,
    },
    actor,
    { supabase },
  );
  assert.equal(receipt.registrationId, registrationId);
  assert.equal(receipt.status, 'in_progress');
  const call = supabase.calls[0];
  assert.equal(call.name, 'create_company_registration');
  assert.equal(call.args.p_actor_id, actor.actorId);
  assert.equal(call.args.p_tenant_id, actor.tenantId);
  assert.equal(call.args.p_company_id, actor.companyId);
  assert.equal(call.args.p_title, 'New LLC');
  assert.equal(call.args.p_priority, 'normal');
  assert.equal(call.args.p_due_at, null);
  assert.equal(call.args.p_operation_id, operationId);
  assert.match(call.args.p_payload_hash as string, /^[0-9a-f]{64}$/);
});

test('payload hash is deterministic for identical logical inputs', async () => {
  const { createRegistration } = await import('./registration-workflow');
  const receiptData = {
    data: {
      registrationId,
      serviceCaseId,
      status: 'in_progress',
      currentStage: 'application_submitted',
      registrationVersion: 1,
      currentStageVersion: 1,
    },
    error: null,
  };
  const first = fakeSupabase([receiptData]);
  const second = fakeSupabase([receiptData]);
  const input = {
    companyId: actor.companyId,
    title: 'New LLC',
    priority: 'normal' as const,
    dueAt: null,
    operationId,
  };
  await createRegistration(input, actor, { supabase: first });
  await createRegistration(input, actor, { supabase: second });
  assert.equal(first.calls[0].args.p_payload_hash, second.calls[0].args.p_payload_hash);
});

test('transitionStage maps a domain error onto the public ApiError', async () => {
  const { transitionStage } = await import('./registration-workflow');
  const supabase = fakeSupabase([
    { data: null, error: { message: 'STALE_STAGE_VERSION', code: 'P0001' } },
  ]);
  await assert.rejects(
    () =>
      transitionStage(
        {
          registrationId,
          stageId,
          command: 'complete',
          expectedRegistrationVersion: 1,
          expectedStageVersion: 1,
          operationId,
        },
        actor,
        { supabase },
      ),
    (error: unknown) => {
      const api = error as { code: string; status: number };
      assert.equal(api.code, 'STALE_STAGE_VERSION');
      assert.equal(api.status, 409);
      return true;
    },
  );
});

test('a receipt that does not match the contract raises an internal ApiError', async () => {
  const { createRegistration } = await import('./registration-workflow');
  const supabase = fakeSupabase([{ data: { registrationId, unexpected: true }, error: null }]);
  await assert.rejects(
    () =>
      createRegistration(
        { companyId: actor.companyId, title: 'New LLC', priority: 'low', dueAt: null, operationId },
        actor,
        { supabase },
      ),
    (error: unknown) => {
      const api = error as { code: string; status: number };
      assert.equal(api.status, 500);
      return true;
    },
  );
});

test('createVisaPerson forwards the correct source id for the person kind', async () => {
  const { createVisaPerson } = await import('./registration-workflow');
  const shareholderId = '12121212-1212-4212-8212-121212121212';
  const supabase = fakeSupabase([
    {
      data: {
        registrationId,
        visaPersonId: stageId,
        displayName: 'Aisha Khan',
        personKind: 'shareholder',
        visaKind: 'investor',
        status: 'not_started',
        currentStage: 'documents_ready',
        visaVersion: 1,
      },
      error: null,
    },
  ]);
  const receipt = await createVisaPerson(
    {
      registrationId,
      personKind: 'shareholder',
      visaKind: 'investor',
      shareholderId,
      displayName: 'Aisha Khan',
      operationId,
    },
    actor,
    { supabase },
  );
  assert.equal(receipt.status, 'not_started');
  const call = supabase.calls[0];
  assert.equal(call.name, 'create_registration_visa_person');
  assert.equal(call.args.p_shareholder_id, shareholderId);
  assert.equal(call.args.p_employee_id, null);
  assert.equal(call.args.p_person_kind, 'shareholder');
});

test('read wrappers pass operator AAL and reject malformed receipts', async () => {
  const { readOperatorRegistration } = await import('./registration-workflow');
  const supabase = fakeSupabase([
    {
      data: {
        registrationId,
        tenantId: actor.tenantId,
        companyId: actor.companyId,
        serviceCaseId,
        status: 'in_progress',
        currentStage: 'application_submitted',
        registrationVersion: 2,
        stages: [],
        visaPeople: [],
        generatedAt: '2026-09-23T10:00:00.000Z',
      },
      error: null,
    },
  ]);
  const read = await readOperatorRegistration(
    registrationId,
    { actorId: actor.actorId, actorAal: 'aal2' },
    { supabase },
  );
  assert.equal(read.registrationVersion, 2);
  assert.equal(supabase.calls[0].name, 'read_operator_registration_workflow');
  assert.equal(supabase.calls[0].args.p_actor_aal, 'aal2');
});

const companyFilter = '12121212-1212-4212-8212-121212121212';
const proFilter = '13131313-1313-4313-8313-131313131313';

test('readAdminRegistrationIndex passes AAL2, nullable filters, page and parses the receipt', async () => {
  const { readAdminRegistrationIndex } = await import('./registration-workflow');
  const supabase = fakeSupabase([
    {
      data: {
        items: [
          {
            registrationId,
            tenantId: actor.tenantId,
            companyId: actor.companyId,
            companyName: 'Acme FZ',
            proName: 'Sara PRO',
            title: 'New LLC',
            status: 'in_progress',
            currentStage: 'application_submitted',
            currentStageStatus: 'in_progress',
            completedStages: 1,
            totalStages: 7,
            registrationVersion: 2,
            updatedAt: '2026-09-23T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
      error: null,
    },
  ]);
  const receipt = await readAdminRegistrationIndex(
    { actorId: actor.actorId, actorAal: 'aal2' },
    {
      company: companyFilter,
      pro: proFilter,
      stage: 'application_submitted',
      status: null,
      page: 1,
    },
    { supabase },
  );
  assert.equal(receipt.total, 1);
  assert.equal(receipt.items[0].companyName, 'Acme FZ');
  const call = supabase.calls[0];
  assert.equal(call.name, 'read_admin_registration_index');
  assert.equal(call.args.p_actor_id, actor.actorId);
  assert.equal(call.args.p_actor_aal, 'aal2');
  assert.equal(call.args.p_company, companyFilter);
  assert.equal(call.args.p_pro, proFilter);
  assert.equal(call.args.p_stage, 'application_submitted');
  assert.equal(call.args.p_status, null);
  assert.equal(call.args.p_page, 1);
});

test('readAdminRegistrationIndex rejects a non-uuid company filter before the RPC', async () => {
  const { readAdminRegistrationIndex } = await import('./registration-workflow');
  const supabase = fakeSupabase([{ data: null, error: null }]);
  await assert.rejects(() =>
    readAdminRegistrationIndex(
      { actorId: actor.actorId, actorAal: 'aal2' },
      { company: 'Acme', pro: null, stage: null, status: null, page: 1 },
      { supabase },
    ),
  );
  assert.equal(supabase.calls.length, 0);
});

test('readAdminRegistrationIndex surfaces a malformed receipt as an internal read error', async () => {
  const { readAdminRegistrationIndex } = await import('./registration-workflow');
  const supabase = fakeSupabase([
    { data: { items: 'nope', total: 1, page: 1, pageSize: 20 }, error: null },
  ]);
  await assert.rejects(
    () =>
      readAdminRegistrationIndex(
        { actorId: actor.actorId, actorAal: 'aal2' },
        { company: null, pro: null, stage: null, status: null, page: 1 },
        { supabase },
      ),
    (error: unknown) => {
      const api = error as { status: number };
      assert.equal(api.status, 500);
      return true;
    },
  );
});

test('resolveCompanyActiveRegistration passes scope+role and returns the id', async () => {
  const { resolveCompanyActiveRegistration } = await import('./registration-workflow');
  // The RPC `returns uuid` (a bare scalar), not a jsonb object.
  const supabase = fakeSupabase([{ data: registrationId, error: null }]);
  const id = await resolveCompanyActiveRegistration(
    { role: 'pro', actorId: actor.actorId, tenantId: actor.tenantId, companyId: actor.companyId },
    { supabase },
  );
  assert.equal(id, registrationId);
  const call = supabase.calls[0];
  assert.equal(call.name, 'resolve_company_active_registration');
  assert.equal(call.args.p_actor_id, actor.actorId);
  assert.equal(call.args.p_tenant_id, actor.tenantId);
  assert.equal(call.args.p_company_id, actor.companyId);
  assert.equal(call.args.p_role, 'pro');
});

test('resolveCompanyActiveRegistration returns null when no registration is active', async () => {
  const { resolveCompanyActiveRegistration } = await import('./registration-workflow');
  // No active registration: the RPC raises P0001 REGISTRATION_NOT_FOUND.
  const supabase = fakeSupabase([
    { data: null, error: { message: 'REGISTRATION_NOT_FOUND', code: 'P0001' } },
  ]);
  const id = await resolveCompanyActiveRegistration(
    {
      role: 'employee',
      actorId: actor.actorId,
      tenantId: actor.tenantId,
      companyId: actor.companyId,
    },
    { supabase },
  );
  assert.equal(id, null);
  assert.equal(supabase.calls[0].args.p_role, 'employee');
});

test('resolveCompanyActiveRegistration maps an authorization error onto an ApiError', async () => {
  const { resolveCompanyActiveRegistration } = await import('./registration-workflow');
  const supabase = fakeSupabase([{ data: null, error: { message: 'FORBIDDEN', code: 'P0001' } }]);
  await assert.rejects(() =>
    resolveCompanyActiveRegistration(
      {
        role: 'customer',
        actorId: actor.actorId,
        tenantId: actor.tenantId,
        companyId: actor.companyId,
      },
      { supabase },
    ),
  );
});
