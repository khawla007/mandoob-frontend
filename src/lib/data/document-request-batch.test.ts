import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

import { ApiError } from '@/lib/errors';
import type { DocumentRequestBatchRpcClient } from './document-request-batch';

type BatchModule = typeof import('./document-request-batch');
let batchModule: BatchModule | null = null;
async function load(): Promise<BatchModule> {
  batchModule ??= await import('./document-request-batch');
  return batchModule;
}

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_IDS = [
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
];

const items = [
  { doc_type: 'passport', label: 'Passport', due_at: '2026-10-01', notes: '' },
  {
    doc_type: 'other',
    custom_type_label: '  Board   resolution  ',
    label: 'Signed resolution',
    due_at: '',
    notes: 'Latest signed copy',
  },
];

test('batch parser normalizes bounded standard and custom request items', async () => {
  const { parseDocumentRequestBatchItems } = await load();
  const parsed = parseDocumentRequestBatchItems(JSON.stringify(items));
  assert.deepEqual(parsed, [
    { doc_type: 'passport', label: 'Passport', due_at: '2026-10-01' },
    {
      doc_type: 'other',
      custom_type_label: 'Board resolution',
      label: 'Signed resolution',
      notes: 'Latest signed copy',
    },
  ]);
});

test('batch parser rejects empty, oversized, malformed and unsafe custom batches', async () => {
  const { parseDocumentRequestBatchItems } = await load();
  for (const candidate of [
    '[]',
    JSON.stringify(Array.from({ length: 26 }, () => items[0])),
    '{',
    JSON.stringify([{ ...items[0], custom_type_label: 'not allowed' }]),
    JSON.stringify([{ ...items[1], custom_type_label: '../private/path' }]),
    JSON.stringify([{ ...items[1], custom_type_label: '' }]),
  ]) {
    assert.throws(() => parseDocumentRequestBatchItems(candidate), ApiError);
  }
});

test('batch DAL invokes one service RPC and returns its ordered replay-safe IDs', async () => {
  const { createDocumentRequestBatch, parseDocumentRequestBatchItems } = await load();
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  const client: DocumentRequestBatchRpcClient = {
    rpc: async (name, parameters) => {
      calls.push({ name, parameters });
      return {
        data: { operation_id: OPERATION_ID, request_ids: REQUEST_IDS, replayed: false },
        error: null,
      };
    },
  };
  const result = await createDocumentRequestBatch(
    { tenantId: TENANT_ID, actorId: ACTOR_ID, companyId: COMPANY_ID, role: 'pro' },
    { operationId: OPERATION_ID, items: parseDocumentRequestBatchItems(JSON.stringify(items)) },
    { client },
  );

  assert.deepEqual(result, { operationId: OPERATION_ID, requestIds: REQUEST_IDS, replayed: false });
  assert.deepEqual(calls, [
    {
      name: 'create_document_request_batch',
      parameters: {
        p_operation_id: OPERATION_ID,
        p_actor_id: ACTOR_ID,
        p_tenant_id: TENANT_ID,
        p_company_id: COMPANY_ID,
        p_items: parseDocumentRequestBatchItems(JSON.stringify(items)),
      },
    },
  ]);
});

test('batch DAL rejects non-PRO, malformed receipts and maps conflicts without raw details', async () => {
  const { createDocumentRequestBatch, parseDocumentRequestBatchItems } = await load();
  const neverClient: DocumentRequestBatchRpcClient = {
    rpc: async () => assert.fail('RPC must not run'),
  };
  await assert.rejects(
    () =>
      createDocumentRequestBatch(
        { tenantId: TENANT_ID, actorId: ACTOR_ID, companyId: COMPANY_ID, role: 'admin' as never },
        { operationId: OPERATION_ID, items: parseDocumentRequestBatchItems(JSON.stringify(items)) },
        { client: neverClient },
      ),
    (error) => error instanceof ApiError && error.code === 'FORBIDDEN',
  );

  for (const response of [
    {
      data: { operation_id: OPERATION_ID, request_ids: [REQUEST_IDS[0]], replayed: false },
      error: null,
    },
    { data: null, error: { message: 'operation_id_conflict raw row detail' } },
  ]) {
    const client: DocumentRequestBatchRpcClient = { rpc: async () => response };
    await assert.rejects(
      () =>
        createDocumentRequestBatch(
          { tenantId: TENANT_ID, actorId: ACTOR_ID, companyId: COMPANY_ID, role: 'pro' },
          {
            operationId: OPERATION_ID,
            items: parseDocumentRequestBatchItems(JSON.stringify(items)),
          },
          { client },
        ),
      (error) =>
        error instanceof ApiError &&
        ['CONFLICT', 'INTERNAL'].includes(error.code) &&
        !error.message.includes('raw row detail'),
    );
  }
});

test('batch DAL maps only stable database boundary codes', async () => {
  const { createDocumentRequestBatch, parseDocumentRequestBatchItems } = await load();
  const parsed = parseDocumentRequestBatchItems(JSON.stringify(items));
  for (const [databaseCode, expectedCode, expectedStatus] of [
    ['DR400', 'VALIDATION_FAILED', 400],
    ['DR403', 'FORBIDDEN', 403],
    ['DR409', 'CONFLICT', 409],
  ] as const) {
    await assert.rejects(
      () =>
        createDocumentRequestBatch(
          { tenantId: TENANT_ID, actorId: ACTOR_ID, companyId: COMPANY_ID, role: 'pro' },
          { operationId: OPERATION_ID, items: parsed },
          { client: { rpc: async () => ({ data: null, error: { code: databaseCode } }) } },
        ),
      (error) =>
        error instanceof ApiError && error.code === expectedCode && error.status === expectedStatus,
    );
  }
});
