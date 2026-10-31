import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

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
    { data: { outcome: 'applied' }, error: false },
    { data: { outcome: 'applied' }, error: 0 },
    { data: { outcome: 'applied' } },
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

test('the direct outbound access audit detects property and element access variants', () => {
  const fixture = `
    client.from('outbound_sms').update({ status: 'sent' });
    getClient()['from']("outbound_whatsapp").select('id');
    client[\`from\`]('outbound_sms');
    client.from(dynamicTable);
  `;
  assert.deepEqual(directOutboundAccesses(fixture, 'fixture.ts'), [
    "fixture.ts:2 client.from('outbound_sms')",
    `fixture.ts:3 getClient()['from']("outbound_whatsapp")`,
    "fixture.ts:4 client[`from`]('outbound_sms')",
  ]);
});

test('verified callback production trees contain no direct outbound status access', () => {
  const root = process.cwd();
  const callbackRoot = join(root, 'src/app/api/v1/webhooks');
  const files = ['twilio', 'unifonic', 'whatsapp'].flatMap((provider) =>
    productionFiles(join(callbackRoot, provider)),
  );
  const accesses = files.flatMap((path) =>
    directOutboundAccesses(readFileSync(path, 'utf8'), relative(root, path)),
  );
  assert.deepEqual(accesses, [], `direct outbound callback access:\n${accesses.join('\n')}`);

  for (const path of [
    'src/app/api/v1/webhooks/twilio/route.ts',
    'src/app/api/v1/webhooks/unifonic/route.ts',
    'src/app/api/v1/webhooks/whatsapp/dispatch.ts',
  ]) {
    assert.match(
      readFileSync(path, 'utf8'),
      /applyProviderDeliveryStatus/u,
      `${path} must call the atomic adapter`,
    );
  }
});

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return /\.(?:ts|tsx)$/u.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/u.test(entry.name)
      ? [path]
      : [];
  });
}

function directOutboundAccesses(sourceText: string, path: string): string[] {
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
  const accesses: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      isFromAccess(node.expression) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      ['outbound_sms', 'outbound_whatsapp'].includes(node.arguments[0].text)
    ) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      accesses.push(`${path}:${line} ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return accesses;
}

function isFromAccess(expression: ts.LeftHandSideExpression): boolean {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === 'from';
  if (!ts.isElementAccessExpression(expression)) return false;
  return Boolean(
    expression.argumentExpression &&
    ts.isStringLiteralLike(expression.argumentExpression) &&
    expression.argumentExpression.text === 'from',
  );
}
