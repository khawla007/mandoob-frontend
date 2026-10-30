import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

import { hashDestinationKey } from './contracts';

const subject = () => import('./inbound-destination-provisioning');
const tenantId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const correlationId = '44444444-4444-4444-8444-444444444444';
const destinationId = '55555555-5555-4555-8555-555555555555';
const secret = 'inbound-destination-secret-32-bytes-minimum';

function input(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'twilio' as const,
    tenantId,
    companyId,
    destinationKey: '  +971 50 123 4567 ',
    operationId,
    correlationId,
    ...overrides,
  };
}

test('computes the existing deterministic v1 HMAC and provisions disabled by default', async () => {
  const { provisionInboundDestination } = await subject();
  const calls: unknown[] = [];
  const result = await provisionInboundDestination(input(), {
    secret,
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: [{ destination_id: destinationId, enabled: false, replayed: false }],
        error: null,
      };
    },
  });

  assert.deepEqual(result, { destinationId, enabled: false, replayed: false });
  assert.deepEqual(calls, [
    {
      name: 'provision_inbound_destination',
      args: {
        p_provider: 'twilio',
        p_tenant_id: tenantId,
        p_company_id: companyId,
        p_destination_id: null,
        p_destination_key_hash: hashDestinationKey('twilio', '+971501234567', secret),
        p_enabled: false,
        p_readiness_approved: false,
        p_operation_id: operationId,
        p_correlation_id: correlationId,
      },
    },
  ]);
});

test('fails closed before RPC when the HMAC secret is absent or too short', async () => {
  const { provisionInboundDestination } = await subject();
  let calls = 0;
  for (const invalidSecret of [undefined, 'too-short']) {
    await assert.rejects(
      provisionInboundDestination(input(), {
        secret: invalidSecret,
        async rpc() {
          calls += 1;
          return { data: null, error: null };
        },
      }),
      /INBOUND_DESTINATION_PROVISIONING_FAILED/,
    );
  }
  assert.equal(calls, 0);
});

test('requires explicit readiness approval before requesting enablement', async () => {
  const { provisionInboundDestination } = await subject();
  let calls = 0;
  await assert.rejects(
    provisionInboundDestination(input({ enabled: true }), {
      secret,
      async rpc() {
        calls += 1;
        return { data: null, error: null };
      },
    }),
    /INBOUND_DESTINATION_PROVISIONING_FAILED/,
  );
  assert.equal(calls, 0);

  await provisionInboundDestination(input({ enabled: true, readinessApproved: true }), {
    secret,
    async rpc(_name, args) {
      calls += 1;
      assert.equal(args.p_enabled, true);
      assert.equal(args.p_readiness_approved, true);
      return {
        data: [{ destination_id: destinationId, enabled: true, replayed: false }],
        error: null,
      };
    },
  });
  assert.equal(calls, 1);
});

test('validates identifiers and sanitizes RPC and malformed-response details', async () => {
  const { provisionInboundDestination } = await subject();
  const failures = [
    provisionInboundDestination(input({ tenantId: 'not-a-uuid' }), {
      secret,
      async rpc() {
        throw new Error('must not run');
      },
    }),
    provisionInboundDestination(input(), {
      secret,
      async rpc() {
        return { data: null, error: { code: 'XX000', message: 'database secret detail' } };
      },
    }),
    provisionInboundDestination(input(), {
      secret,
      async rpc() {
        return { data: [{ destination_id: 'private malformed detail' }], error: null };
      },
    }),
  ];

  for (const failure of failures) {
    await assert.rejects(failure, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'INBOUND_DESTINATION_PROVISIONING_FAILED');
      assert.equal(JSON.stringify(error).includes('secret detail'), false);
      assert.equal(JSON.stringify(error).includes('private malformed'), false);
      return true;
    });
  }
});

test('fails closed when the RPC reports an enablement state different from the request', async () => {
  const { provisionInboundDestination } = await subject();
  await assert.rejects(
    provisionInboundDestination(input(), {
      secret,
      async rpc() {
        return {
          data: [{ destination_id: destinationId, enabled: true, replayed: false }],
          error: null,
        };
      },
    }),
    /INBOUND_DESTINATION_PROVISIONING_FAILED/,
  );
});

test('server helper contains no provider SDK or network call', () => {
  const source = readFileSync('src/lib/events/inbound-destination-provisioning.ts', 'utf8');
  assert.doesNotMatch(source, /from ['"](?:twilio|unifonic|[^'"]*whatsapp\/client)|\bfetch\s*\(/iu);
});
