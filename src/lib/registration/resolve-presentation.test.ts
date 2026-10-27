import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '44444444-4444-4444-8444-444444444444';
const REGISTRATION_ID = '66666666-6666-4666-8666-666666666666';

const readyPresentation = {
  kind: 'ready' as const,
  value: {
    stages: [],
    currentBlocker: null,
    nextAction: null,
    documents: [],
    visaPeople: [],
    history: [],
  },
  generatedAt: '2026-09-23T10:00:00.000Z',
};

test('resolveScopedRegistrationPresentation loads the presentation when a registration resolves', async () => {
  const { resolveScopedRegistrationPresentation } = await import('./resolve-presentation');
  let loadedId: string | undefined;
  const state = await resolveScopedRegistrationPresentation(
    { role: 'pro', actorId: ACTOR_ID, tenantId: TENANT_ID, companyId: COMPANY_ID },
    { role: 'pro', actorId: ACTOR_ID, tenantId: TENANT_ID, companyId: COMPANY_ID },
    {
      resolveActiveRegistration: async () => REGISTRATION_ID,
      loadPresentation: async (id) => {
        loadedId = id;
        return readyPresentation;
      },
    },
  );
  assert.equal(loadedId, REGISTRATION_ID);
  assert.equal(state.kind, 'ready');
});

test('resolveScopedRegistrationPresentation fails closed when no registration is active', async () => {
  const { resolveScopedRegistrationPresentation } = await import('./resolve-presentation');
  let loaded = false;
  const state = await resolveScopedRegistrationPresentation(
    { role: 'customer', actorId: ACTOR_ID, tenantId: TENANT_ID, companyId: COMPANY_ID },
    { role: 'customer', actorId: ACTOR_ID },
    {
      resolveActiveRegistration: async () => null,
      loadPresentation: async () => {
        loaded = true;
        return readyPresentation;
      },
    },
  );
  assert.deepEqual(state, { kind: 'unavailable', reason: 'registration_contract_unavailable' });
  assert.equal(loaded, false);
});

test('resolveScopedRegistrationPresentation fails closed when resolution throws (no leak)', async () => {
  const { resolveScopedRegistrationPresentation } = await import('./resolve-presentation');
  const state = await resolveScopedRegistrationPresentation(
    { role: 'pro', actorId: ACTOR_ID, tenantId: TENANT_ID, companyId: COMPANY_ID },
    { role: 'pro', actorId: ACTOR_ID, tenantId: TENANT_ID, companyId: COMPANY_ID },
    {
      resolveActiveRegistration: async () => {
        throw new Error('FORBIDDEN');
      },
      loadPresentation: async () => readyPresentation,
    },
  );
  assert.deepEqual(state, { kind: 'unavailable', reason: 'registration_contract_unavailable' });
});

test('SECURITY: resolveEmployeeVisaPresentation scopes the loader to the employee actor + company (no ordinal key)', async () => {
  const { resolveEmployeeVisaPresentation } = await import('./resolve-presentation');
  let seenContext: Record<string, unknown> | undefined;
  const state = await resolveEmployeeVisaPresentation(
    { actorId: ACTOR_ID, tenantId: TENANT_ID, companyId: COMPANY_ID },
    {
      resolveActiveRegistration: async (ctx) => {
        assert.equal(ctx.role, 'employee');
        return REGISTRATION_ID;
      },
      loadVisaPresentation: async (_id, context) => {
        seenContext = context as unknown as Record<string, unknown>;
        return { kind: 'ready', value: [], generatedAt: null };
      },
    },
  );
  assert.equal(state.kind, 'ready');
  assert.equal(seenContext?.role, 'employee');
  assert.equal(seenContext?.actorId, ACTOR_ID);
  assert.equal(seenContext?.tenantId, TENANT_ID);
  assert.equal(seenContext?.companyId, COMPANY_ID);
  // The employee scope no longer carries an ordinal `${registrationId}:visa:0`
  // key: the RPC keys the visa person by the actor's own employee_id.
  assert.equal(seenContext?.employeeVisaPersonKey, undefined);
});

test('resolveEmployeeVisaPresentation fails closed to visa-unavailable when nothing resolves', async () => {
  const { resolveEmployeeVisaPresentation } = await import('./resolve-presentation');
  const state = await resolveEmployeeVisaPresentation(
    { actorId: ACTOR_ID, tenantId: TENANT_ID, companyId: COMPANY_ID },
    {
      resolveActiveRegistration: async () => null,
      loadVisaPresentation: async () => ({ kind: 'ready', value: [], generatedAt: null }),
    },
  );
  assert.deepEqual(state, { kind: 'unavailable', reason: 'visa_contract_unavailable' });
});

test('resolveEmployeeVisaPresentation fails closed when resolution throws', async () => {
  const { resolveEmployeeVisaPresentation } = await import('./resolve-presentation');
  const state = await resolveEmployeeVisaPresentation(
    { actorId: ACTOR_ID, tenantId: TENANT_ID, companyId: COMPANY_ID },
    {
      resolveActiveRegistration: async () => {
        throw new Error('boom');
      },
      loadVisaPresentation: async () => ({ kind: 'ready', value: [], generatedAt: null }),
    },
  );
  assert.deepEqual(state, { kind: 'unavailable', reason: 'visa_contract_unavailable' });
});
