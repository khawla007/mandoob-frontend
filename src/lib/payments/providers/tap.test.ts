import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCharge,
  createRefund,
  getCharge,
  getRefund,
  lookupChargeByEffectKey,
  mapTapRefundStatus,
  minorToMajor,
  isAllowedTapRedirectUrl,
  isAllowedTapApiBase,
} from './tap';

test('refund status mapping permits only the explicit success contract', () => {
  for (const status of ['REFUNDED']) assert.equal(mapTapRefundStatus(status), 'succeeded');
  for (const status of [
    'DECLINED',
    'FAILED',
    'REJECTED',
    'RESTRICTED',
    'TIMED_OUT',
    'TIMEDOUT',
    'CANCELLED',
    'CANCELED',
  ])
    assert.equal(mapTapRefundStatus(status), 'failed');
  for (const status of [
    'PENDING',
    'ACCEPTED',
    'IN_PROGRESS',
    'UNKNOWN',
    'CAPTURED',
    'SUCCEEDED',
    'COMPLETED',
    '',
    'unexpected',
    'FUTURE_PROVIDER_STATUS',
  ])
    assert.equal(mapTapRefundStatus(status), 'pending');
});

test('durable charge lookup is read-only and normalized by persisted effect key', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    requestInit = init;
    return new Response(
      JSON.stringify({
        charges: [
          {
            id: 'charge-recovered',
            status: 'INITIATED',
            amount: '17.25',
            currency: 'AED',
            merchant: { id: 'merchant-1' },
            transaction: { url: 'https://tap.test/recovered' },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const result = await lookupChargeByEffectKey('p309-charge-durable', {
      source: 'tenant',
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      secretKey: 'secret',
      webhookSecret: 'webhook',
      apiBase: 'https://tap.test',
      enabled: true,
    });
    assert.match(requestedUrl, /\/v2\/charges\/list$/u);
    assert.equal((requestInit?.headers as Record<string, string>)['Idempotency-Key'], undefined);
    assert.match(String(requestInit?.body), /p309-charge-durable/u);
    assert.deepEqual(result, {
      ok: true,
      chargeId: 'charge-recovered',
      transactionUrl: 'https://tap.test/recovered',
      status: 'INITIATED',
      amountMinor: 1725,
      currency: 'AED',
      merchantId: 'merchant-1',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
    return new Response(
      JSON.stringify({ id: 'refund-1', status: 'REFUNDED', merchant: { id: 'merchant-1' } }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
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
    assert.equal('raw' in result, false);
    assert.equal(
      (requestInit?.headers as Record<string, string> | undefined)?.['Idempotency-Key'],
      'mandoob-refund-1',
    );
    assert.equal(JSON.parse(String(requestInit?.body)).reference.idempotent, 'mandoob-refund-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createCharge requires and sends the persisted provider effect key', async () => {
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    requestInit = init;
    return new Response(
      JSON.stringify({
        id: 'charge-1',
        status: 'INITIATED',
        amount: 10,
        currency: 'AED',
        merchant: { id: 'merchant-1' },
        transaction: { url: 'https://tap.test/pay' },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const result = await createCharge({
      config: {
        source: 'tenant',
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        secretKey: 'secret',
        webhookSecret: 'webhook',
        apiBase: 'https://tap.test',
        enabled: true,
      },
      amountMinor: 1000,
      currency: 'AED',
      description: 'Invoice',
      customer: {},
      redirectUrl: 'https://app.test/return',
      postUrl: 'https://app.test/webhook',
      idempotencyKey: 'p309-charge-operation',
    });
    assert.equal(result.ok, true);
    assert.equal(
      (requestInit?.headers as Record<string, string>)['Idempotency-Key'],
      'p309-charge-operation',
    );
    assert.equal(
      JSON.parse(String(requestInit?.body)).reference.idempotent,
      'p309-charge-operation',
    );
    assert.equal('raw' in result, false);
    if (result.ok)
      assert.deepEqual(result, {
        ok: true,
        chargeId: 'charge-1',
        transactionUrl: 'https://tap.test/pay',
        status: 'INITIATED',
        amountMinor: 1000,
        currency: 'AED',
        merchantId: 'merchant-1',
      });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider failures and lookups expose normalized safe fields without raw payloads', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ errors: [{ description: 'card secret PAN 4111111111111111' }] }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  try {
    const result = await getCharge('charge-1', {
      source: 'tenant',
      tenantId: 'tenant-1',
      merchantId: null,
      secretKey: 'secret',
      webhookSecret: 'webhook',
      apiBase: 'https://tap.test',
      enabled: true,
    });
    assert.deepEqual(result, {
      ok: false,
      error: 'provider unavailable',
      retryable: true,
      status: 502,
    });
    assert.equal(JSON.stringify(result).includes('4111'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('minorToMajor falls back to 2 decimals for unknown currency', () => {
  assert.equal(minorToMajor(BigInt(1234), 'XYZ'), '12.34');
});

test('currency exponents and provider URL allowlists are exact', () => {
  assert.equal(minorToMajor(1234, 'BHD'), '1.234');
  assert.equal(isAllowedTapRedirectUrl('https://checkout.tap.company/pay/1', 'production'), true);
  assert.equal(
    isAllowedTapRedirectUrl('https://checkout.tap.company.evil.test/pay/1', 'production'),
    false,
  );
  assert.equal(isAllowedTapRedirectUrl('http://checkout.tap.company/pay/1', 'production'), false);
  assert.equal(
    isAllowedTapRedirectUrl('https://checkout.tap.company:8443/pay/1', 'production'),
    false,
  );
  assert.equal(isAllowedTapApiBase('https://api.tap.company', 'production'), true);
  assert.equal(isAllowedTapApiBase('https://tap.test', 'production'), false);
  assert.equal(isAllowedTapApiBase('https://tap.test', 'test'), true);
});

test('provider fetch aborts at the injected timeout', async () => {
  const fetchImpl: typeof fetch = async (_url, init) =>
    await new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    });
  const result = await getCharge(
    'charge-timeout',
    {
      source: 'tenant',
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      secretKey: 'secret',
      webhookSecret: 'webhook',
      apiBase: 'https://tap.test',
      enabled: true,
    },
    { timeoutMs: 1, fetchImpl },
  );
  assert.deepEqual(result, { ok: false, error: 'provider unavailable', retryable: true });
});

test('getRefund retrieves the durable provider intent status', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(
      JSON.stringify({ id: 'refund-1', status: 'REFUNDED', merchant: { id: 'merchant-1' } }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
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
