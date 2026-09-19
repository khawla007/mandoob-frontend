import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import { ApiError } from '@/lib/errors';
import type { CustomerUploadAuthority } from './customer-document-upload';

type UploadModule = typeof import('./customer-document-upload');
let modulePromise: Promise<UploadModule> | undefined;
function load(): Promise<UploadModule> {
  modulePromise ??= import('./customer-document-upload');
  return modulePromise;
}

const authority: CustomerUploadAuthority = {
  actorId: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000002',
  companyId: '30000000-0000-4000-8000-000000000003',
};
const fields = {
  doc_type: 'passport' as const,
  operation_id: '40000000-0000-4000-8000-000000000004',
  request_id: '50000000-0000-4000-8000-000000000005',
  label: 'Passport',
};
const file = new File(['%PDF-1.4'], 'passport.pdf', { type: 'application/pdf' });

test('pending and fulfilled requested uploads reach the coordinator with exact authority', async () => {
  const { submitCustomerDocumentUpload } = await load();
  for (const status of ['pending', 'fulfilled'] as const) {
    const calls: unknown[] = [];
    const result = await submitCustomerDocumentUpload(
      authority,
      fields,
      file,
      { ip: '203.0.113.1', userAgent: 'test' },
      {
        readRequest: async (...args) => (calls.push(['request', ...args]), status),
        upload: async (input) => {
          calls.push(['upload', input]);
          return { documentId: 'doc', versionId: 'version' };
        },
      },
    );
    assert.deepEqual(result, { documentId: 'doc', versionId: 'version' });
    assert.deepEqual(calls[0], [
      'request',
      authority.tenantId,
      authority.companyId,
      fields.request_id,
    ]);
    assert.deepEqual(calls[1], [
      'upload',
      {
        tenantId: authority.tenantId,
        companyId: authority.companyId,
        docType: fields.doc_type,
        operationId: fields.operation_id,
        requestId: fields.request_id,
        label: fields.label,
        file: {
          data: new Uint8Array(await file.arrayBuffer()),
          originalName: file.name,
          mimeType: file.type,
        },
        actor: {
          id: authority.actorId,
          role: 'customer',
          ip: '203.0.113.1',
          userAgent: 'test',
        },
      },
    ]);
  }
});

test('foreign, missing, and cancelled requests are denied before bytes or coordinator', async () => {
  const { submitCustomerDocumentUpload } = await load();
  for (const status of [null, 'cancelled'] as const) {
    let uploaded = false;
    const guardedFile = new File(['%PDF-1.4'], 'passport.pdf', { type: 'application/pdf' });
    Object.defineProperty(guardedFile, 'arrayBuffer', {
      value: () => assert.fail('file bytes read before request authority'),
    });
    await assert.rejects(
      () =>
        submitCustomerDocumentUpload(
          authority,
          fields,
          guardedFile,
          {},
          {
            readRequest: async () => status,
            upload: async () => {
              uploaded = true;
              return { documentId: 'doc', versionId: 'version' };
            },
          },
        ),
      (error) => error instanceof ApiError && error.code === 'FORBIDDEN',
    );
    assert.equal(uploaded, false);
  }
});
