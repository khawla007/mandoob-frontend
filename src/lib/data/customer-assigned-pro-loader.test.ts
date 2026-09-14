import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCustomerAssignedProSupabaseStore,
  loadCustomerAssignedPro,
  type CustomerAssignedProStore,
} from './customer-assigned-pro-loader';

const access = {
  kind: 'authorized' as const,
  tenant: { id: 'tenant-1', slug: 'acme' },
  session: { id: 'customer-1', role: 'customer' as const, tenantId: 'tenant-1' },
  company: { id: 'company-1', tenantId: 'tenant-1', companyName: 'Acme' },
} as never;

function store(overrides: Partial<CustomerAssignedProStore> = {}): CustomerAssignedProStore {
  return {
    activeAssignments: async () => ({ data: [], error: null }),
    releasedAssignments: async () => ({ data: [], error: null }),
    assignedProfile: async () => ({ data: null, error: null }),
    ...overrides,
  };
}

test('assignment distinguishes missing, released, source error, and invariant violation', async () => {
  assert.deepEqual(await loadCustomerAssignedPro(access, { store: store() }), { kind: 'missing' });
  assert.deepEqual(
    await loadCustomerAssignedPro(access, {
      store: store({ releasedAssignments: async () => ({ data: [{ id: 'old' }], error: null }) }),
    }),
    { kind: 'released' },
  );
  assert.deepEqual(
    await loadCustomerAssignedPro(access, {
      store: store({ activeAssignments: async () => ({ data: null, error: new Error('raw') }) }),
    }),
    { kind: 'error' },
  );
  assert.deepEqual(
    await loadCustomerAssignedPro(access, {
      store: store({
        activeAssignments: async () => ({
          data: [
            { id: 'new', pro_profile_id: 'pro-1' },
            { id: 'older', pro_profile_id: 'pro-2' },
          ],
          error: null,
        }),
      }),
    }),
    { kind: 'error' },
  );
});

test('active assignment exposes only identity and keeps contact unavailable without consent proof', async () => {
  const value = await loadCustomerAssignedPro(access, {
    store: store({
      activeAssignments: async () => ({
        data: [{ id: 'assignment-1', pro_profile_id: 'pro-1' }],
        error: null,
      }),
      assignedProfile: async () => ({
        data: {
          id: 'pro-1',
          tenant_id: 'tenant-1',
          role: 'pro',
          status: 'active',
          full_name: 'A PRO',
          title: 'Advisor',
        },
        error: null,
      }),
    }),
  });
  assert.deepEqual(value, {
    kind: 'active',
    value: { fullName: 'A PRO', title: 'Advisor', contact: { kind: 'unavailable' } },
  });
});

test('inactive and suspended assigned profiles fail closed', async () => {
  for (const status of ['inactive', 'suspended']) {
    const value = await loadCustomerAssignedPro(access, {
      store: store({
        activeAssignments: async () => ({
          data: [{ id: 'assignment-1', pro_profile_id: 'pro-1' }],
          error: null,
        }),
        assignedProfile: async () => ({
          data: {
            id: 'pro-1',
            tenant_id: 'tenant-1',
            role: 'pro',
            status,
            full_name: 'Unavailable PRO',
            title: 'Advisor',
          },
          error: null,
        }),
      }),
    });
    assert.deepEqual(value, { kind: 'error' });
  }
});

test('assignment store scopes reads and detects duplicate active rows deterministically without admin RPC', async () => {
  const traces: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  const client = {
    from(table: string) {
      const trace = { table, calls: [] as Array<[string, ...unknown[]]> };
      traces.push(trace);
      const response = { data: [], error: null };
      const builder = Object.fromEntries(
        ['select', 'eq', 'order', 'limit', 'maybeSingle'].map((method) => [
          method,
          (...args: unknown[]) => {
            trace.calls.push([method, ...args]);
            return method === 'maybeSingle' ? Promise.resolve(response) : builder;
          },
        ]),
      ) as Record<string, (...args: unknown[]) => unknown> & {
        then: (resolve: (value: typeof response) => unknown) => Promise<unknown>;
      };
      builder.then = (resolve) => Promise.resolve(response).then(resolve);
      return builder;
    },
  };
  const assigned = createCustomerAssignedProSupabaseStore(client as never);
  await assigned.activeAssignments('tenant-1', 'company-1');
  await assigned.releasedAssignments('tenant-1', 'company-1');
  await assigned.assignedProfile('tenant-1', 'pro-1');

  const assignment = traces[0]!;
  assert.ok(assignment.calls.some((call) => call[0] === 'eq' && call[1] === 'tenant_id'));
  assert.ok(assignment.calls.some((call) => call[0] === 'eq' && call[1] === 'company_id'));
  assert.ok(
    assignment.calls.some(
      (call) => call[0] === 'eq' && call[1] === 'status' && call[2] === 'active',
    ),
  );
  assert.ok(assignment.calls.some((call) => call[0] === 'order' && call[1] === 'assigned_at'));
  assert.ok(assignment.calls.some((call) => call[0] === 'order' && call[1] === 'id'));
  assert.ok(assignment.calls.some((call) => call[0] === 'limit' && call[1] === 2));
  const profileProjection = String(traces.at(-1)?.calls.find((call) => call[0] === 'select')?.[1]);
  assert.equal(profileProjection, 'id, tenant_id, role, status, full_name, title');
  const profile = traces.at(-1)!;
  assert.ok(
    profile.calls.some((call) => call[0] === 'eq' && call[1] === 'status' && call[2] === 'active'),
  );
});
