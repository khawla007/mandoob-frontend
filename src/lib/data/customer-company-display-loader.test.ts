import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CUSTOMER_COMPANY_COLLECTION_LIMIT,
  createCustomerCompanyDisplaySupabaseStore,
  loadCustomerCompanyDisplay,
  type CustomerCompanyDisplayStore,
} from './customer-company-display-loader';

const access = {
  kind: 'authorized' as const,
  tenant: { id: 'tenant-1', slug: 'acme' },
  session: { id: 'customer-1', role: 'customer' as const, tenantId: 'tenant-1' },
  company: {
    id: 'company-1',
    tenantId: 'tenant-1',
    companyName: 'Acme LLC',
    status: 'active',
    onboardingStatus: 'complete',
  },
} as never;

function result<T = never>(data: T | null = null, error: unknown = null) {
  return Promise.resolve({ data, error });
}

test('Company display sources settle independently and mask only accepted last-four values', async () => {
  const store: CustomerCompanyDisplayStore = {
    legalIdentity: async () => result(null, new Error('provider detail')),
    shareholders: async () =>
      result([
        {
          id: 'shareholder-1',
          kind: 'individual',
          full_name: 'A Person',
          legal_name: null,
          nationality_code: 'AE',
          country_of_incorporation: null,
          ownership_percent: 100,
          passport_no_last4: 'A123',
          registration_no_last4: null,
        },
        {
          id: 'shareholder-2',
          kind: 'company',
          full_name: null,
          legal_name: 'Owner Co',
          nationality_code: null,
          country_of_incorporation: 'GB',
          ownership_percent: 0,
          passport_no_last4: null,
          registration_no_last4: 'not-valid',
        },
      ]),
    activities: async () => result([]),
    office: async () => result(null),
    establishment: async () => result(null),
    bank: async () =>
      result({
        bank_name: 'Bank',
        account_holder_name: 'Acme LLC',
        currency_code: 'AED',
        iban_last4: '6789',
        account_number_last4: 'invalid!',
      }),
    lifecycle: async () => result({ status: 'active' }),
    onboarding: async () => result({ onboarding_status: 'complete' }),
  };

  const display = await loadCustomerCompanyDisplay(access, { store });

  assert.deepEqual(display.legalIdentity, { kind: 'error' });
  assert.equal(display.shareholders.kind, 'ready');
  if (display.shareholders.kind === 'ready') {
    assert.equal(display.shareholders.value[0]?.protectedIdentifier, '•••• A123');
    assert.equal(display.shareholders.value[1]?.protectedIdentifier, null);
  }
  assert.deepEqual(display.activities, { kind: 'empty', value: [] });
  assert.deepEqual(display.office, { kind: 'empty', value: null });
  assert.deepEqual(display.establishment, { kind: 'empty', value: null });
  assert.equal(display.bank.kind, 'ready');
  if (display.bank.kind === 'ready' && display.bank.value) {
    assert.equal(display.bank.value.ibanMasked, '•••• 6789');
    assert.equal(display.bank.value.accountNumberMasked, null);
  }
  assert.deepEqual(display.readiness, { kind: 'unavailable' });
});

test('Company collections fail closed when the bounded read proves overflow', async () => {
  const shareholder = (index: number) => ({
    id: `shareholder-${index}`,
    kind: 'individual' as const,
    full_name: `Person ${index}`,
    legal_name: null,
    nationality_code: 'AE',
    country_of_incorporation: null,
    ownership_percent: 1,
    passport_no_last4: null,
    registration_no_last4: null,
  });
  const activity = (index: number) => ({
    id: `activity-${index}`,
    activity_code: String(index),
    activity_name: `Activity ${index}`,
    authority_name: 'Authority',
    is_primary: index === 0,
  });
  const display = await loadCustomerCompanyDisplay(access, {
    store: {
      legalIdentity: async () => result(null),
      shareholders: async () =>
        result(
          Array.from({ length: CUSTOMER_COMPANY_COLLECTION_LIMIT + 1 }, (_, i) => shareholder(i)),
        ),
      activities: async () =>
        result(
          Array.from({ length: CUSTOMER_COMPANY_COLLECTION_LIMIT + 1 }, (_, i) => activity(i)),
        ),
      office: async () => result(null),
      establishment: async () => result(null),
      bank: async () => result(null),
      lifecycle: async () => result(null),
      onboarding: async () => result(null),
    },
  });

  assert.deepEqual(display.shareholders, { kind: 'unavailable' });
  assert.deepEqual(display.activities, { kind: 'unavailable' });
});

test('every Company display query binds tenant and Company with safe projections', async () => {
  const traces: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  const client = {
    from(table: string) {
      const trace = { table, calls: [] as Array<[string, ...unknown[]]> };
      traces.push(trace);
      const response = { data: table.includes('details') ? null : [], error: null };
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
  const store = createCustomerCompanyDisplaySupabaseStore(client as never);

  await Promise.all([
    store.legalIdentity('tenant-1', 'company-1'),
    store.shareholders('tenant-1', 'company-1'),
    store.activities('tenant-1', 'company-1'),
    store.office('tenant-1', 'company-1'),
    store.establishment('tenant-1', 'company-1'),
    store.bank('tenant-1', 'company-1'),
    store.lifecycle('tenant-1', 'company-1'),
    store.onboarding('tenant-1', 'company-1'),
  ]);

  for (const trace of traces) {
    assert.ok(trace.calls.some((call) => call[0] === 'eq' && call[1] === 'tenant_id'));
    assert.ok(
      trace.calls.some(
        (call) => call[0] === 'eq' && (call[1] === 'id' || call[1] === 'company_id'),
      ),
    );
    const projection = String(trace.calls.find((call) => call[0] === 'select')?.[1] ?? '');
    assert.doesNotMatch(
      projection,
      /encrypted|hash|swift_bic(?:,|$)|passport_no(?!_last4)|registration_no(?!_last4)|account_number(?!_last4)|iban(?!_last4)/u,
    );
  }
  for (const table of ['company_shareholders', 'company_registered_activities']) {
    const trace = traces.find((candidate) => candidate.table === table)!;
    assert.deepEqual(
      trace.calls.filter((call) => call[0] === 'order'),
      [
        ['order', 'sort_order', { ascending: true }],
        ['order', 'id', { ascending: true }],
      ],
    );
    assert.ok(
      trace.calls.some(
        (call) => call[0] === 'limit' && call[1] === CUSTOMER_COMPANY_COLLECTION_LIMIT + 1,
      ),
    );
  }
});
