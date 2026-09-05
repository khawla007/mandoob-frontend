import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CustomerCompanyAccess } from './customer-company-access';
import type { DocType } from '@/lib/validation/document';

const PAGE_SIZE = 50;

type QueryResult<T> = { data: T[] | null; count: number | null; error: unknown };
type ReviewStatus = 'pending' | 'approved' | 'rejected';

type RequestRow = {
  id: string;
  doc_type: DocType;
  label: string;
  notes: string | null;
  due_at: string | null;
  created_at: string;
  documents: Array<{
    id: string;
    tenant_id: string;
    company_id: string;
    current_version_id: string | null;
    currentVersion:
      | Pick<VersionRow, 'id' | 'review_status' | 'review_note'>
      | Array<Pick<VersionRow, 'id' | 'review_status' | 'review_note'>>
      | null;
  }> | null;
};

type VersionRow = {
  id: string;
  mime_type: string;
  size_bytes: number;
  review_status: ReviewStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type DocumentRow = {
  id: string;
  doc_type: DocType;
  label: string | null;
  request_id: string | null;
  updated_at: string;
  currentVersion: VersionRow | VersionRow[] | null;
};

export type CustomerDocumentCenterStore = {
  awaitingCount: (tenantId: string, companyId: string) => Promise<QueryResult<unknown>>;
  reviewCount: (
    tenantId: string,
    companyId: string,
    status: ReviewStatus,
  ) => Promise<QueryResult<unknown>>;
  requests: (tenantId: string, companyId: string) => Promise<QueryResult<RequestRow>>;
  documents: (tenantId: string, companyId: string) => Promise<QueryResult<DocumentRow>>;
};

export type CustomerDocumentPanelState<T> =
  | { kind: 'ready'; value: T; hasMore: boolean }
  | { kind: 'empty'; value: T; hasMore: false }
  | { kind: 'error' };

export type CustomerDocumentCountState = { kind: 'ready'; value: number } | { kind: 'error' };

export type CustomerDocumentRequest = {
  id: string;
  docType: DocType;
  label: string;
  instructions: string | null;
  dueAt: string | null;
  createdAt: string;
  submission:
    | { kind: 'none' }
    | { kind: 'unavailable' }
    | {
        kind: 'current';
        documentId: string;
        versionId: string;
        reviewStatus: ReviewStatus;
        rejectionReason: string | null;
      };
};

export type CustomerSubmittedDocument = {
  id: string;
  docType: DocType;
  label: string | null;
  requestId: string | null;
  updatedAt: string;
  currentVersion: {
    id: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: 'unavailable';
    reviewStatus: ReviewStatus;
    rejectionReason: string | null;
    reviewedAt: string | null;
    uploadedAt: string;
  } | null;
};

export function groupCustomerSubmittedDocuments(documents: CustomerSubmittedDocument[]) {
  const groups = new Map<DocType, CustomerSubmittedDocument[]>();
  for (const document of documents) {
    const group = groups.get(document.docType);
    if (group) group.push(document);
    else groups.set(document.docType, [document]);
  }
  return Array.from(groups, ([docType, groupedDocuments]) => ({
    docType,
    documents: groupedDocuments,
  }));
}

export function createCustomerDocumentCenterSupabaseStore(
  client: Pick<SupabaseClient, 'from'>,
): CustomerDocumentCenterStore {
  return {
    awaitingCount: async (tenantId, companyId) =>
      await client
        .from('document_requests')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('status', 'pending'),
    reviewCount: async (tenantId, companyId, status) =>
      await client
        .from('documents')
        .select(
          'id, currentVersion:document_versions!documents_current_version_fk!inner(id, review_status)',
          { count: 'exact', head: true },
        )
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('currentVersion.review_status', status),
    requests: async (tenantId, companyId) =>
      await client
        .from('document_requests')
        .select(
          'id, doc_type, label, notes, due_at, created_at, documents:documents!documents_request_id_fkey(id, tenant_id, company_id, current_version_id, currentVersion:document_versions!documents_current_version_fk(id, review_status, review_note))',
        )
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('documents.tenant_id', tenantId)
        .eq('documents.company_id', companyId)
        .eq('status', 'pending')
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(PAGE_SIZE + 1),
    documents: async (tenantId, companyId) =>
      await client
        .from('documents')
        .select(
          'id, doc_type, label, request_id, updated_at, currentVersion:document_versions!documents_current_version_fk(id, mime_type, size_bytes, review_status, review_note, reviewed_at, created_at)',
        )
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .not('current_version_id', 'is', null)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(PAGE_SIZE + 1),
  };
}

async function settleCount(
  promise: Promise<QueryResult<unknown>>,
): Promise<CustomerDocumentCountState> {
  try {
    const result = await promise;
    if (
      result.error ||
      result.count === null ||
      !Number.isSafeInteger(result.count) ||
      result.count < 0
    ) {
      return { kind: 'error' };
    }
    return { kind: 'ready', value: result.count };
  } catch {
    return { kind: 'error' };
  }
}

async function settleList<Row, Value>(
  promise: Promise<QueryResult<Row>>,
  map: (row: Row) => Value,
): Promise<CustomerDocumentPanelState<Value[]>> {
  try {
    const result = await promise;
    if (result.error) return { kind: 'error' };
    const rows = result.data ?? [];
    const value = rows.slice(0, PAGE_SIZE).map(map);
    if (value.length === 0) return { kind: 'empty', value, hasMore: false };
    return { kind: 'ready', value, hasMore: rows.length > PAGE_SIZE };
  } catch {
    return { kind: 'error' };
  }
}

export async function loadCustomerDocumentCenter(
  access: Extract<CustomerCompanyAccess, { kind: 'authorized' }>,
  dependencies: { store?: CustomerDocumentCenterStore } = {},
) {
  const store = dependencies.store ?? (await createDefaultStore());
  const { tenant, company } = access;
  const args = [tenant.id, company.id] as const;

  const [awaiting, underReview, approved, rejected, requests, documents] = await Promise.all([
    settleCount(store.awaitingCount(...args)),
    settleCount(store.reviewCount(...args, 'pending')),
    settleCount(store.reviewCount(...args, 'approved')),
    settleCount(store.reviewCount(...args, 'rejected')),
    settleList(store.requests(...args), (row) => {
      const joinedHeadsAvailable = row.documents !== null;
      const heads = row.documents ?? [];
      const head = heads.length === 1 ? heads[0] : null;
      const joinedVersion = head
        ? Array.isArray(head.currentVersion)
          ? head.currentVersion[0]
          : head.currentVersion
        : null;
      const scopedHead =
        head?.tenant_id === tenant.id && head.company_id === company.id ? head : null;
      const version =
        scopedHead?.current_version_id && joinedVersion?.id === scopedHead.current_version_id
          ? joinedVersion
          : null;
      const submission: CustomerDocumentRequest['submission'] = !joinedHeadsAvailable
        ? { kind: 'unavailable' }
        : heads.length === 0
          ? { kind: 'none' }
          : heads.length !== 1 || !scopedHead || !version
            ? { kind: 'unavailable' }
            : {
                kind: 'current',
                documentId: scopedHead.id,
                versionId: version.id,
                reviewStatus: version.review_status,
                rejectionReason: version.review_status === 'rejected' ? version.review_note : null,
              };
      return {
        id: row.id,
        docType: row.doc_type,
        label: row.label,
        instructions: row.notes,
        dueAt: row.due_at,
        createdAt: row.created_at,
        submission,
      };
    }),
    settleList(store.documents(...args), (row) => {
      const version = Array.isArray(row.currentVersion)
        ? row.currentVersion[0]
        : row.currentVersion;
      return {
        id: row.id,
        docType: row.doc_type,
        label: row.label,
        requestId: row.request_id,
        updatedAt: row.updated_at,
        currentVersion: version
          ? {
              id: version.id,
              mimeType: version.mime_type,
              sizeBytes: version.size_bytes,
              scanStatus: 'unavailable' as const,
              reviewStatus: version.review_status,
              rejectionReason: version.review_status === 'rejected' ? version.review_note : null,
              reviewedAt: version.reviewed_at,
              uploadedAt: version.created_at,
            }
          : null,
      };
    }),
  ]);

  return { summary: { awaiting, underReview, approved, rejected }, requests, documents };
}

async function createDefaultStore(): Promise<CustomerDocumentCenterStore> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createCustomerDocumentCenterSupabaseStore(createSupabaseServiceRoleClient());
}
