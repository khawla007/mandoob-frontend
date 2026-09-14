import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key-0000000000000000';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key-000000000000';
process.env.NEXT_PUBLIC_ROOT_DOMAIN ??= 'localhost';
process.env.ENCRYPTION_KEY ??= 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

async function getReceiptPayloadForCustomer(...args: [string, string, string, string, never]) {
  const invoices = await import('./invoices');
  return invoices.getReceiptPayloadForCustomer(...args);
}

const responses = {
  invoices: {
    data: {
      id: 'invoice-1',
      tenant_id: 'tenant-1',
      company_id: 'company-1',
      customer_profile_id: 'profile-1',
      label: 'Government fee',
      amount_minor: 1000,
      currency: 'AED',
      status: 'paid',
      paid_at: '2026-09-01T00:00:00Z',
    },
    error: null,
  },
  tenants: { data: { name: 'Tenant', primary_color: null }, error: null },
  company_profiles: { data: { company_name: 'Company' }, error: null },
  payments: {
    data: {
      id: 'payment-1',
      provider: 'manual',
      method: 'bank_transfer',
      status: 'succeeded',
      received_at: '2026-09-01T00:00:00Z',
    },
    error: null,
  },
  refunds: { data: [], error: null },
  profiles: { data: { full_name: 'Account holder', tenant_id: 'tenant-1' }, error: null },
};

function client(overrides: Partial<typeof responses> = {}) {
  const calls: Array<[string, string, unknown[]]> = [];
  const values = { ...responses, ...overrides };
  return {
    calls,
    value: {
      from(table: keyof typeof responses) {
        const target = Promise.resolve(values[table]);
        const query = new Proxy(target as object, {
          get(object, property) {
            if (property === 'then') return target.then.bind(target);
            return (...args: unknown[]) => {
              calls.push([table, String(property), args]);
              return query;
            };
          },
        });
        return query;
      },
    },
  };
}

test('Customer receipt requires authoritative tenant, Company, payment, profile, and refund facts', async () => {
  const success = client();
  const receipt = await getReceiptPayloadForCustomer(
    'tenant-1',
    'company-1',
    'invoice-1',
    'profile-1',
    success.value as never,
  );
  assert.equal(receipt?.companyName, 'Company');
  for (const [column, value] of [
    ['tenant_id', 'tenant-1'],
    ['company_id', 'company-1'],
    ['id', 'invoice-1'],
  ]) {
    assert.ok(
      success.calls.some(
        ([table, method, args]) =>
          table === 'invoices' && method === 'eq' && args[0] === column && args[1] === value,
      ),
      column,
    );
  }
  assert.ok(
    success.calls.some(
      ([table, method, args]) =>
        table === 'profiles' &&
        method === 'eq' &&
        args[0] === 'tenant_id' &&
        args[1] === 'tenant-1',
    ),
  );

  for (const table of [
    'invoices',
    'tenants',
    'company_profiles',
    'payments',
    'refunds',
    'profiles',
  ] as const) {
    const failed = client({ [table]: { data: null, error: new Error('private') } as never });
    assert.equal(
      await getReceiptPayloadForCustomer(
        'tenant-1',
        'company-1',
        'invoice-1',
        'profile-1',
        failed.value as never,
      ),
      null,
      table,
    );
  }
});

test('Customer receipt rejects unsafe money, missing payment truth, and cross-tenant profile data', async () => {
  for (const overrides of [
    {
      invoices: {
        data: { ...responses.invoices.data, amount_minor: Number.MAX_SAFE_INTEGER + 1 },
        error: null,
      },
    },
    { payments: { data: null, error: null } },
    { profiles: { data: { full_name: 'Wrong', tenant_id: 'tenant-2' }, error: null } },
  ]) {
    const failed = client(overrides as never);
    assert.equal(
      await getReceiptPayloadForCustomer(
        'tenant-1',
        'company-1',
        'invoice-1',
        'profile-1',
        failed.value as never,
      ),
      null,
    );
  }
});
