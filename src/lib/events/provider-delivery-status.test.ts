import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const subject = () => import('./provider-delivery-status');

test('calls the atomic delivery RPC with exact normalized arguments', async () => {
  const { applyProviderDeliveryStatus } = await subject();
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: { outcome: 'applied' }, error: null };
    },
  };

  const outcome = await applyProviderDeliveryStatus(client, {
    channel: 'whatsapp',
    provider: 'whatsapp',
    providerMessageId: 'wamid.123',
    providerStatus: 'delivered',
    providerOccurredAt: '1735689600',
    safeErrorCode: 131047,
  });

  assert.equal(outcome, 'applied');
  assert.deepEqual(calls, [
    {
      name: 'apply_provider_delivery_status',
      args: {
        p_channel: 'whatsapp',
        p_provider: 'whatsapp',
        p_provider_message_id: 'wamid.123',
        p_provider_status: 'delivered',
        p_provider_occurred_at: '2025-01-01T00:00:00.000Z',
        p_safe_error_code: '131047',
      },
    },
  ]);
});

test('passes every redacted RPC outcome through without mutation', async () => {
  const { applyProviderDeliveryStatus } = await subject();
  for (const expected of ['applied', 'replayed', 'stale', 'unknown', 'not_found'] as const) {
    const result = await applyProviderDeliveryStatus(
      {
        async rpc() {
          return { data: { outcome: expected }, error: null };
        },
      },
      {
        channel: 'sms',
        provider: 'twilio',
        providerMessageId: 'SM123',
        providerStatus: 'sent',
      },
    );
    assert.equal(result, expected);
  }
});

test('drops invalid timestamps and unsafe provider error details before the RPC', async () => {
  const { applyProviderDeliveryStatus } = await subject();
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    async rpc(_name: string, args: Record<string, unknown>) {
      calls.push(args);
      return { data: { outcome: 'unknown' }, error: null };
    },
  };

  await applyProviderDeliveryStatus(client, {
    channel: 'sms',
    provider: 'unifonic',
    providerMessageId: 'uni-1',
    providerStatus: 'failed',
    providerOccurredAt: 'not-a-date',
    safeErrorCode: 'secret provider message with spaces',
  });

  assert.equal(calls[0]?.p_provider_occurred_at, null);
  assert.equal(calls[0]?.p_safe_error_code, null);
});

test('fails closed with one sanitized error for RPC errors, throws, and malformed data', async () => {
  const { applyProviderDeliveryStatus, ProviderDeliveryStatusUnavailableError } = await subject();
  const results = [
    undefined,
    null,
    42,
    'not-an-rpc-result',
    { data: null, error: { message: 'private database detail' } },
    { data: null, error: null },
    { data: [], error: null },
    { data: { outcome: 'private-table-row' }, error: null },
    { data: { outcome: 1 }, error: null },
  ];
  const clients = [
    ...results.map((result) => ({
      async rpc() {
        return result;
      },
    })),
    {
      async rpc(): Promise<never> {
        throw new Error('private transport detail');
      },
    },
  ];

  for (const client of clients) {
    await assert.rejects(
      applyProviderDeliveryStatus(client as never, {
        channel: 'sms',
        provider: 'twilio',
        providerMessageId: 'SM123',
        providerStatus: 'sent',
      }),
      (error: unknown) => {
        assert.ok(error instanceof ProviderDeliveryStatusUnavailableError);
        assert.equal(error.message, 'DELIVERY_STATUS_UNAVAILABLE');
        assert.equal(JSON.stringify(error).includes('private'), false);
        return true;
      },
    );
  }
});

test('verified callback production code contains no direct outbound status update', () => {
  const paths = [
    'src/app/api/v1/webhooks/twilio/route.ts',
    'src/app/api/v1/webhooks/unifonic/route.ts',
    'src/app/api/v1/webhooks/whatsapp/dispatch.ts',
  ];
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(
      source,
      /\.from\(\s*['"]outbound_(?:sms|whatsapp)['"]\s*\)/u,
      `${path} must not select or update outbound delivery rows directly`,
    );
    assert.match(source, /applyProviderDeliveryStatus/u, `${path} must call the atomic adapter`);
  }
});
