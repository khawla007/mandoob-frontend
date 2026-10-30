import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listActiveInvoiceCustomerOptions,
  type InvoiceCustomerOptionStore,
} from './invoice-customer-options';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];

test('invoice customer options preserve every active linked customer in deterministic order', async () => {
  const store: InvoiceCustomerOptionStore = {
    linked: async () => ({ data: ids.map((profileId) => ({ profileId })), error: null }),
    active: async () => ({
      data: [
        { id: ids[1]!, fullName: 'Zara Owner' },
        { id: ids[0]!, fullName: '  Adam Owner  ' },
      ],
      error: null,
    }),
  };
  assert.deepEqual(await listActiveInvoiceCustomerOptions('tenant-1', 'company-1', store), [
    { id: ids[0], label: 'Adam Owner' },
    { id: ids[1], label: 'Zara Owner' },
  ]);
});

test('invoice customer options fail closed on errors, foreign rows, and unbounded ownership sets', async () => {
  const emptyStore: InvoiceCustomerOptionStore = {
    linked: async () => ({ data: [], error: null }),
    active: async () => {
      throw new Error('active lookup must not run without linked customers');
    },
  };
  assert.deepEqual(await listActiveInvoiceCustomerOptions('tenant-1', 'company-1', emptyStore), []);

  const errorStore: InvoiceCustomerOptionStore = {
    linked: async () => ({ data: null, error: 'unavailable' }),
    active: async () => ({ data: [], error: null }),
  };
  assert.deepEqual(await listActiveInvoiceCustomerOptions('tenant-1', 'company-1', errorStore), []);

  const activeErrorStore: InvoiceCustomerOptionStore = {
    linked: async () => ({ data: [{ profileId: ids[0]! }], error: null }),
    active: async () => ({ data: null, error: 'unavailable' }),
  };
  assert.deepEqual(
    await listActiveInvoiceCustomerOptions('tenant-1', 'company-1', activeErrorStore),
    [],
  );

  const overflowStore: InvoiceCustomerOptionStore = {
    linked: async () => ({
      data: Array.from({ length: 101 }, (_, index) => ({
        profileId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
      })),
      error: null,
    }),
    active: async () => ({ data: [], error: null }),
  };
  assert.deepEqual(
    await listActiveInvoiceCustomerOptions('tenant-1', 'company-1', overflowStore),
    [],
  );

  const foreignStore: InvoiceCustomerOptionStore = {
    linked: async () => ({ data: [{ profileId: ids[0]! }], error: null }),
    active: async () => ({ data: [{ id: ids[1]!, fullName: 'Foreign' }], error: null }),
  };
  assert.deepEqual(
    await listActiveInvoiceCustomerOptions('tenant-1', 'company-1', foreignStore),
    [],
  );
});
