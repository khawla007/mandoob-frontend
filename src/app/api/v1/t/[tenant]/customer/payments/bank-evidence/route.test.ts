process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { MULTIPART_BODY_ENVELOPE_BYTES } from '@/app/api/v1/_shared/bounded-body';
import { MAX_BANK_EVIDENCE_BYTES } from '@/lib/finance/p3-07-bank-evidence-adapter';
import { createCustomerBankEvidencePostHandler } from './route-handler';

const UUID = {
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
  invoiceId: '44444444-4444-4444-8444-444444444444',
  operationId: '55555555-5555-4555-8555-555555555555',
  submissionId: '66666666-6666-4666-8666-666666666666',
  documentId: '77777777-7777-4777-8777-777777777777',
  versionId: '88888888-8888-4888-8888-888888888888',
};
const authority = {
  actorId: UUID.actorId,
  customerProfileId: UUID.actorId,
  tenantId: UUID.tenantId,
  companyId: UUID.companyId,
};
const context = { params: Promise.resolve({ tenant: 'alpha' }) };
function request(file = new File(['%PDF-1.7\nfixture'], 'proof.pdf', { type: 'application/pdf' })) {
  const form = new FormData();
  form.set('invoice_id', UUID.invoiceId);
  form.set('operation_id', UUID.operationId);
  form.set('file', file);
  return new Request('http://localhost/api/v1/t/alpha/customer/payments/bank-evidence', {
    method: 'POST',
    body: form,
  });
}
const base = () => ({
  guardCsrf: async () => null,
  authorize: async () => authority,
  limit: async () => 'allowed' as const,
  submit: async () => ({
    status: 'pending' as const,
    operationId: UUID.operationId,
    submissionId: UUID.submissionId,
    documentId: UUID.documentId,
    versionId: UUID.versionId,
    replayed: false,
  }),
  revalidate: () => undefined,
  log: () => undefined,
});

test('bank evidence applies CSRF, auth, and fail-closed rate limit before multipart body access', async () => {
  for (const denied of ['csrf', 'authorize', 'limit'] as const) {
    const calls: string[] = [];
    const handler = createCustomerBankEvidencePostHandler({
      ...base(),
      guardCsrf: async () => (
        calls.push('csrf'),
        denied === 'csrf' ? new Response(null, { status: 403 }) : null
      ),
      authorize: async () => {
        calls.push('authorize');
        if (denied === 'authorize') throw new Error('inactive customer private detail');
        return authority;
      },
      limit: async () => (calls.push('limit'), denied === 'limit' ? 'unavailable' : 'allowed'),
    });
    const upload = request();
    const body = upload.body;
    Object.defineProperty(upload, 'body', {
      configurable: true,
      get() {
        calls.push('body');
        return body;
      },
    });
    const response = await handler(upload, context);
    assert.equal(response.status, denied === 'limit' ? 503 : denied === 'authorize' ? 404 : 403);
    assert.equal(calls.includes('body'), false);
    assert.doesNotMatch(await response.text(), /private detail/u);
  }
});

test('bank evidence accepts only the exact bounded contract and returns safe identifiers/state', async () => {
  const received: unknown[] = [];
  const handler = createCustomerBankEvidencePostHandler({
    ...base(),
    submit: async (input) => (received.push(input), base().submit()),
  });
  const response = await handler(request(), context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      status: 'pending',
      submissionId: UUID.submissionId,
      documentId: UUID.documentId,
      versionId: UUID.versionId,
      replayed: false,
    },
  });
  assert.deepEqual(received[0], {
    ...authority,
    invoiceId: UUID.invoiceId,
    operationId: UUID.operationId,
    policyKey: null,
    expiresAt: null,
    file: {
      data: new Uint8Array(Buffer.from('%PDF-1.7\nfixture')),
      filename: 'proof.pdf',
      mimeType: 'application/pdf',
    },
  });
});

test('bank evidence rejects body/file overflow and extra or retention fields before submit', async () => {
  let submissions = 0;
  const handler = createCustomerBankEvidencePostHandler({
    ...base(),
    submit: async () => (submissions++, base().submit()),
  });
  const declared = request();
  declared.headers.set(
    'content-length',
    String(MAX_BANK_EVIDENCE_BYTES + MULTIPART_BODY_ENVELOPE_BYTES + 1),
  );
  assert.equal((await handler(declared, context)).status, 413);
  assert.equal(
    (
      await handler(
        request(
          new File([new Uint8Array(MAX_BANK_EVIDENCE_BYTES + 1)], 'proof.pdf', {
            type: 'application/pdf',
          }),
        ),
        context,
      )
    ).status,
    413,
  );
  const dirty = await request().formData();
  dirty.set('policy_key', 'invented-duration');
  assert.equal(
    (
      await handler(
        new Request('http://localhost/upload', { method: 'POST', body: dirty }),
        context,
      )
    ).status,
    400,
  );
  assert.equal(submissions, 0);
});

test('route is a thin dynamic Next 16 handler and does not expose path, URL, or raw errors', async () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/v1/t/[tenant]/customer/payments/bank-evidence/route.ts'),
    'utf8',
  );
  assert.match(route, /export const dynamic = 'force-dynamic'/u);
  const handler = createCustomerBankEvidencePostHandler({
    ...base(),
    submit: async () => {
      throw new Error('storage/private/path token=secret');
    },
  });
  const response = await handler(request(), context);
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /storage|path|secret|url/iu);
});
