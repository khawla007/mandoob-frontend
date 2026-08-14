import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import { logSafeActionError, normalizeActionRequestMetadata } from './server-action-security';

test('action request metadata validates forwarded IP and caps user agent', () => {
  assert.deepEqual(
    normalizeActionRequestMetadata(
      new Headers({
        'x-forwarded-for': 'not-an-ip, 192.0.2.1',
        'user-agent': 'x'.repeat(700),
      }),
    ),
    { ip: 'unknown', userAgent: 'x'.repeat(512) },
  );
  assert.deepEqual(
    normalizeActionRequestMetadata(new Headers({ 'x-forwarded-for': '2001:db8::1, 192.0.2.1' })),
    { ip: '2001:db8::1', userAgent: null },
  );
});

test('safe action logging emits only allowlisted structure without raw exception data', () => {
  const original = console.error;
  const entries: unknown[][] = [];
  console.error = (...args: unknown[]) => entries.push(args);
  try {
    const secret = 'storage/tenant/private.pdf customer-secret';
    logSafeActionError(
      'document_center.open',
      new ApiError('INTERNAL', secret, 500, { storagePath: secret }),
    );
    class PrivateProviderFailure extends Error {}
    logSafeActionError('document_client.request', new PrivateProviderFailure(secret));
  } finally {
    console.error = original;
  }

  assert.equal(entries.length, 2);
  assert.deepEqual(Object.keys(entries[0][0] as object).sort(), [
    'code',
    'correlationId',
    'errorClass',
    'operation',
  ]);
  assert.match((entries[0][0] as { correlationId: string }).correlationId, /^[0-9a-f-]{36}$/u);
  assert.equal((entries[0][0] as { code: string }).code, 'INTERNAL');
  assert.equal((entries[0][0] as { errorClass: string }).errorClass, 'ApiError');
  assert.equal((entries[1][0] as { code: string }).code, 'UNEXPECTED');
  assert.equal((entries[1][0] as { errorClass: string }).errorClass, 'UnknownError');
  assert.doesNotMatch(JSON.stringify(entries), /private\.pdf|customer-secret|storage\/tenant/u);
});
