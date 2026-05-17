process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.VIRUSTOTAL_API_KEY = 'vt_test_key';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@/lib/errors';

type DocumentsModule = typeof import('./documents');
let mod: DocumentsModule | null = null;
async function load(): Promise<DocumentsModule> {
  if (!mod) mod = await import('./documents');
  return mod;
}

const originalFetch = globalThis.fetch;

function pdfWith(body: string): Uint8Array {
  return Buffer.from(`%PDF-1.4\n${body}\n%%EOF`);
}

function uploadInput(data: Uint8Array) {
  return {
    tenantId: '11111111-1111-4111-8111-111111111111',
    clientId: '22222222-2222-4222-8222-222222222222',
    docType: 'passport' as const,
    requestId: '33333333-3333-4333-8333-333333333333',
    label: 'Passport',
    file: {
      data,
      originalName: 'passport.pdf',
      mimeType: 'application/pdf',
    },
    actor: {
      id: '44444444-4444-4444-8444-444444444444',
      role: 'customer' as const,
      ip: '127.0.0.1',
      userAgent: 'node-test',
    },
  };
}

async function assertUploadRejects(
  data: Uint8Array,
  expectedCode: string,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  const urls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    urls.push(String(input));
    return fetchImpl(input, init);
  }) as typeof fetch;

  const { uploadDocument } = await load();
  await assert.rejects(
    () => uploadDocument(uploadInput(data)),
    (err) => err instanceof ApiError && err.code === expectedCode,
  );
  return urls;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('uploadDocument rejects EICAR before storage or document inserts and writes audit', async () => {
  const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  const urls = await assertUploadRejects(
    pdfWith(eicar),
    'FILE_REJECTED_BY_SCAN',
    async () => Response.json([], { status: 201 }),
  );

  assert.equal(urls.filter((url) => url.includes('/rest/v1/tenant_audit_log')).length, 1);
  assert.equal(urls.some((url) => url.includes('/storage/v1/object/tenant-documents')), false);
  assert.equal(urls.some((url) => url.includes('/rest/v1/documents')), false);
  assert.equal(urls.some((url) => url.includes('/rest/v1/document_versions')), false);
});

test('uploadDocument returns SCANNER_UNAVAILABLE when provider fails closed', async () => {
  const urls = await assertUploadRejects(
    pdfWith('clean but scanner unavailable'),
    'SCANNER_UNAVAILABLE',
    async (input) => {
      const url = String(input);
      if (url === 'https://www.virustotal.com/api/v3/files') {
        return new Response('provider unavailable', { status: 500 });
      }
      return Response.json([], { status: 201 });
    },
  );

  assert.equal(urls.filter((url) => url.includes('/rest/v1/tenant_audit_log')).length, 1);
  assert.equal(urls.some((url) => url.includes('/storage/v1/object/tenant-documents')), false);
  assert.equal(urls.some((url) => url.includes('/rest/v1/documents')), false);
  assert.equal(urls.some((url) => url.includes('/rest/v1/document_versions')), false);
});
