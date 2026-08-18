import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRefund, getRefund, minorToMajor } from './tap';

test('minorToMajor formats AED fils to two decimals', () => {
  assert.equal(minorToMajor(BigInt(125000), 'AED'), '1250.00');
  assert.equal(minorToMajor(BigInt(50), 'AED'), '0.50');
  assert.equal(minorToMajor(BigInt(0), 'AED'), '0.00');
});

test('minorToMajor accepts number input', () => {
  assert.equal(minorToMajor(199, 'AED'), '1.99');
});

test('createRefund sends the durable intent key to Tap for replay safety', async () => {
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    requestInit = init;
    return new Response(JSON.stringify({ id: 'refund-1', status: 'COMPLETED' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const result = await createRefund({
      config: {
        source: 'tenant',
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        secretKey: 'secret',
        webhookSecret: 'webhook',
        apiBase: 'https://tap.test',
        enabled: true,
      },
      chargeId: 'charge-1',
      amountMinor: 500,
      currency: 'AED',
      reason: 'duplicate',
      idempotencyKey: 'mandoob-refund-1',
    });
    assert.equal(result.ok, true);
    assert.equal(
      (requestInit?.headers as Record<string, string> | undefined)?.['Idempotency-Key'],
      'mandoob-refund-1',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('minorToMajor falls back to 2 decimals for unknown currency', () => {
  assert.equal(minorToMajor(BigInt(1234), 'XYZ'), '12.34');
});

test('getRefund retrieves the durable provider intent status', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ id: 'refund-1', status: 'COMPLETED' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const result = await getRefund('refund-1', {
      source: 'tenant',
      tenantId: 'tenant-1',
      merchantId: null,
      secretKey: 'secret',
      webhookSecret: 'webhook',
      apiBase: 'https://tap.test',
      enabled: true,
    });
    assert.equal(result.ok, true);
    assert.match(requestedUrl, /\/v2\/refunds\/refund-1$/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
