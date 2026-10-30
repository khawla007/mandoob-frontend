import 'server-only';

import { z } from 'zod';

import { ApiError } from '@/lib/errors';
import { calendarDateSchema } from '@/lib/validation/calendar-date';
import { docTypeSchema } from '@/lib/validation/document';
import { UUID_RE } from '@/lib/util/uuid';

const normalizedText = (maximum: number) =>
  z
    .string()
    .transform((value) => value.trim().replace(/\s+/gu, ' '))
    .pipe(z.string().min(1).max(maximum));

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    normalizedText(maximum).optional(),
  );

const customTypeLabelSchema = normalizedText(80).refine(
  (value) => !/[\\/\0]/u.test(value) && !value.includes('..'),
  'Unsafe custom document type',
);

export const documentRequestBatchItemSchema = z
  .object({
    doc_type: docTypeSchema,
    custom_type_label: optionalText(80),
    label: normalizedText(120),
    due_at: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      calendarDateSchema.optional(),
    ),
    notes: optionalText(500),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.doc_type === 'other' && !item.custom_type_label) {
      context.addIssue({ code: 'custom', path: ['custom_type_label'], message: 'Required' });
    }
    if (item.doc_type !== 'other' && item.custom_type_label) {
      context.addIssue({ code: 'custom', path: ['custom_type_label'], message: 'Not allowed' });
    }
    if (
      item.custom_type_label &&
      !customTypeLabelSchema.safeParse(item.custom_type_label).success
    ) {
      context.addIssue({ code: 'custom', path: ['custom_type_label'], message: 'Invalid' });
    }
  })
  .transform((item) => ({
    doc_type: item.doc_type,
    ...(item.custom_type_label ? { custom_type_label: item.custom_type_label } : {}),
    label: item.label,
    ...(item.due_at ? { due_at: item.due_at } : {}),
    ...(item.notes ? { notes: item.notes } : {}),
  }));

export const documentRequestBatchItemsSchema = z
  .array(documentRequestBatchItemSchema)
  .min(1)
  .max(25);
export type DocumentRequestBatchItem = z.infer<typeof documentRequestBatchItemSchema>;

export function parseDocumentRequestBatchItems(value: string): DocumentRequestBatchItem[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'Invalid document request batch', 400);
  }
  const parsed = documentRequestBatchItemsSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid document request batch', 400);
  }
  return parsed.data;
}

export type DocumentRequestBatchRpcClient = {
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

type Context = {
  tenantId: string;
  actorId: string;
  companyId: string;
  role: 'pro';
};

type Dependencies = { client?: DocumentRequestBatchRpcClient };

const uuidSchema = z
  .string()
  .regex(UUID_RE)
  .transform((value) => value.toLowerCase());
const receiptSchema = z.object({
  operation_id: uuidSchema,
  request_ids: z.array(uuidSchema).min(1).max(25),
  replayed: z.boolean(),
});

export async function createDocumentRequestBatch(
  context: Context,
  input: { operationId: string; items: DocumentRequestBatchItem[] },
  dependencies: Dependencies = {},
): Promise<{ operationId: string; requestIds: string[]; replayed: boolean }> {
  if (context.role !== 'pro') throw new ApiError('FORBIDDEN', 'Access denied', 403);
  const scope = z
    .object({
      tenantId: uuidSchema,
      actorId: uuidSchema,
      companyId: uuidSchema,
      operationId: uuidSchema,
      items: documentRequestBatchItemsSchema,
    })
    .safeParse({ ...context, ...input });
  if (!scope.success)
    throw new ApiError('VALIDATION_FAILED', 'Invalid document request batch', 400);

  const client = dependencies.client ?? (await serviceRoleClient());
  const { data, error } = await client.rpc('create_document_request_batch', {
    p_operation_id: scope.data.operationId,
    p_actor_id: scope.data.actorId,
    p_tenant_id: scope.data.tenantId,
    p_company_id: scope.data.companyId,
    p_items: scope.data.items,
  });
  if (error) {
    if (error.code === 'DR400')
      throw new ApiError('VALIDATION_FAILED', 'Invalid document request batch', 400);
    if (error.code === 'DR403') throw new ApiError('FORBIDDEN', 'Access denied', 403);
    if (error.code === 'DR409')
      throw new ApiError(
        'CONFLICT',
        'Document request batch conflicts with an earlier operation',
        409,
      );
    throw new ApiError('INTERNAL', 'Could not create document requests', 500);
  }
  const receipt = receiptSchema.safeParse(data);
  if (
    !receipt.success ||
    receipt.data.operation_id !== scope.data.operationId ||
    receipt.data.request_ids.length !== scope.data.items.length
  ) {
    throw new ApiError('INTERNAL', 'Could not create document requests', 500);
  }
  return {
    operationId: receipt.data.operation_id,
    requestIds: receipt.data.request_ids,
    replayed: receipt.data.replayed,
  };
}

async function serviceRoleClient(): Promise<DocumentRequestBatchRpcClient> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient() as unknown as DocumentRequestBatchRpcClient;
}
