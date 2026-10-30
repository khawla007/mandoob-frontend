import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import { ApiError } from '@/lib/errors';
import type { EmployeeUploadAuthority } from './employee-document-upload';

const ACTOR = '10000000-0000-4000-8000-000000000001';
const TENANT = '20000000-0000-4000-8000-000000000002';
const COMPANY = '30000000-0000-4000-8000-000000000003';
const EMPLOYEE = '40000000-0000-4000-8000-000000000004';
const OPERATION = '50000000-0000-4000-8000-000000000005';
const REQUEST = '60000000-0000-4000-8000-000000000006';
const authority: EmployeeUploadAuthority = {
  actorId: ACTOR,
  tenantId: TENANT,
  companyId: COMPANY,
  employeeId: EMPLOYEE,
};
const fields = {
  doc_type: 'passport' as const,
  operation_id: OPERATION,
  request_id: REQUEST,
  label: 'Passport',
};
const file = new File(['%PDF-1.4'], 'passport.pdf', { type: 'application/pdf' });

test('pending and fulfilled own requests reach the coordinator with exact Employee authority', async () => {
  const { submitEmployeeDocumentUpload } = await import('./employee-document-upload');
  for (const status of ['pending', 'fulfilled'] as const) {
    const calls: unknown[] = [];
    const result = await submitEmployeeDocumentUpload(
      authority,
      fields,
      file,
      {},
      {
        readRequest: async (...args) => {
          calls.push(['request', ...args]);
          return { status, employeeId: EMPLOYEE, docType: 'passport' };
        },
        upload: async (input) => {
          calls.push(['upload', input]);
          return { documentId: 'doc', versionId: 'version' };
        },
      },
    );
    assert.deepEqual(result, { documentId: 'doc', versionId: 'version' });
    assert.deepEqual(calls[0], ['request', TENANT, COMPANY, EMPLOYEE, REQUEST]);
    assert.deepEqual(calls[1], [
      'upload',
      {
        tenantId: TENANT,
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        docType: 'passport',
        operationId: OPERATION,
        requestId: REQUEST,
        label: 'Passport',
        file: {
          data: new Uint8Array(await file.arrayBuffer()),
          originalName: file.name,
          mimeType: file.type,
        },
        actor: { id: ACTOR, role: 'employee', ip: 'unknown', userAgent: null },
      },
    ]);
  }
});

test('foreign, cancelled, and different-document requests fail before reading bytes', async () => {
  const { submitEmployeeDocumentUpload } = await import('./employee-document-upload');
  for (const request of [
    null,
    { status: 'cancelled' as const, employeeId: EMPLOYEE, docType: 'passport' },
    { status: 'pending' as const, employeeId: 'foreign', docType: 'passport' },
    { status: 'pending' as const, employeeId: EMPLOYEE, docType: 'visa' },
  ]) {
    let uploaded = false;
    const guarded = new File(['%PDF-1.4'], 'passport.pdf');
    Object.defineProperty(guarded, 'arrayBuffer', {
      value: () => assert.fail('bytes read before own-request authority'),
    });
    await assert.rejects(
      submitEmployeeDocumentUpload(
        authority,
        fields,
        guarded,
        {},
        {
          readRequest: async () => request,
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
