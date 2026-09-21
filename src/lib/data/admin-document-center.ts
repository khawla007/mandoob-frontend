import 'server-only';

import { z } from 'zod';

import type { AdminDocumentCenterQuery } from '@/app/admin/documents/query';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { docTypeSchema } from '@/lib/validation/document';

const timestampSchema = z.string().datetime({ offset: true });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const rowSchema = z
  .object({
    kind: z.enum(['request', 'document']),
    workspaceName: z.string().min(1).max(200),
    companyName: z.string().min(1).max(200),
    docType: docTypeSchema,
    label: z.string().min(1).max(200),
    requestStatus: z.enum(['pending', 'fulfilled', 'cancelled']).nullable(),
    dueAt: timestampSchema.nullable(),
    uploadedAt: timestampSchema.nullable(),
    reviewStatus: z.enum(['pending', 'approved', 'rejected']).nullable(),
    expiresOn: dateSchema.nullable(),
    createdAt: timestampSchema,
  })
  .strict();
const envelopeSchema = z
  .object({
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1).max(10_000),
    rows: z.array(rowSchema).max(25),
  })
  .strict();
const inputSchema = z
  .object({
    q: z.string().trim().min(1).max(100).nullable(),
    state: z.enum(['all', 'awaiting_upload', 'under_review', 'approved', 'rejected', 'expired']),
    docType: z.union([z.literal('all'), docTypeSchema]),
    page: z.number().int().min(1).max(10_000),
    pageSize: z.literal(25),
  })
  .strict();

export type AdminDocumentCenterRow = z.infer<typeof rowSchema>;
export type AdminDocumentCenterState =
  | {
      kind: 'ready' | 'empty';
      rows: AdminDocumentCenterRow[];
      total: number;
      page: number;
      pageSize: 25;
      totalPages: number;
    }
  | { kind: 'error' };

type RpcArgs = {
  p_search: string | null;
  p_state: AdminDocumentCenterQuery['state'];
  p_doc_type: AdminDocumentCenterQuery['docType'] | null;
  p_page: number;
  p_page_size: 25;
};
type RpcResult = { data: unknown; error: { message?: string } | null };
type Dependencies = {
  requireOperator?: () => Promise<unknown>;
  rpc?: (args: RpcArgs) => Promise<RpcResult>;
  logFailure?: (source: string) => void;
};

async function defaultRpc(args: RpcArgs): Promise<RpcResult> {
  const admin = createSupabaseServiceRoleClient();
  return (await admin.rpc('list_admin_document_center' as never, args as never)) as RpcResult;
}

export async function listAdminDocumentCenter(
  input: AdminDocumentCenterQuery,
  dependencies: Dependencies = {},
): Promise<AdminDocumentCenterState> {
  await (dependencies.requireOperator ?? requirePlatformOperator)();
  const logFailure =
    dependencies.logFailure ??
    ((source: string) => console.error('Admin document center source failed', { source }));

  try {
    const validInput = inputSchema.parse(input);
    const { data, error } = await (dependencies.rpc ?? defaultRpc)({
      p_search: validInput.q,
      p_state: validInput.state,
      p_doc_type: validInput.docType === 'all' ? null : validInput.docType,
      p_page: validInput.page,
      p_page_size: validInput.pageSize,
    });
    if (error) throw new Error('source unavailable');
    const parsed = envelopeSchema.safeParse(data);
    if (!parsed.success) throw new Error('invalid projection');
    const { total, page, rows } = parsed.data;
    const totalPages = Math.max(1, Math.ceil(total / validInput.pageSize));
    if (page > totalPages || (total === 0 && rows.length !== 0) || rows.length > total) {
      throw new Error('inconsistent projection');
    }
    return {
      kind: rows.length === 0 ? 'empty' : 'ready',
      rows,
      total,
      page,
      pageSize: validInput.pageSize,
      totalPages,
    };
  } catch {
    logFailure('adminDocumentCenter');
    return { kind: 'error' };
  }
}
