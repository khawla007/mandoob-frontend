import assert from 'node:assert/strict';
import test from 'node:test';

import { loadCustomerCommunicationConsent } from './customer-communication-consent';

test('communication consent exposes only authoritative active opt-outs', async () => {
  assert.deepEqual(
    await loadCustomerCommunicationConsent('+971500000001', {
      readConsent: async () => ({ whatsapp: true, sms: false }),
    }),
    { kind: 'opted-out', channels: ['whatsapp'] },
  );
  assert.deepEqual(
    await loadCustomerCommunicationConsent('+971500000001', {
      readConsent: async () => ({ whatsapp: true, sms: true }),
    }),
    { kind: 'opted-out', channels: ['whatsapp', 'sms'] },
  );
});

test('communication consent never infers enabled channels from absent opt-outs', async () => {
  assert.deepEqual(
    await loadCustomerCommunicationConsent('+971500000001', {
      readConsent: async () => ({ whatsapp: false, sms: false }),
    }),
    { kind: 'unavailable' },
  );
  assert.deepEqual(await loadCustomerCommunicationConsent(null), { kind: 'unavailable' });
});

test('communication consent fails closed when its authoritative source errors', async () => {
  assert.deepEqual(
    await loadCustomerCommunicationConsent('+971500000001', {
      readConsent: async () => {
        throw new Error('source detail');
      },
    }),
    { kind: 'unavailable' },
  );
});
