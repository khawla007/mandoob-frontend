import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

const PANEL_LIMIT = 50;

export type CompanyDocumentRow = {
  id: string;
  docType: string;
  label: string | null;
  expiresOn: string | null;
  updatedAt: string;
};

export type CompanyDocumentRequestRow = {
  id: string;
  docType: string;
  label: string;
  dueAt: string | null;
  createdAt: string;
};

export type CompanyRenewalRow = {
  id: string;
  type: string;
  label: string;
  dueDate: string;
  status: string;
};

export type CompanyInvoiceRow = {
  id: string;
  label: string;
  amountMinor: number;
  currency: string;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type CompanyActivityRow = {
  id: string;
  action: string;
  source: string;
  createdAt: string;
};

export type CompanyPanelState<T> =
  | { status: 'unrequested' }
  | { status: 'ready'; data: T; focusedId?: string }
  | { status: 'error' };

export type CompanyWorkspace = {
  documents: CompanyPanelState<CompanyDocumentRow[]>;
  requests: CompanyPanelState<CompanyDocumentRequestRow[]>;
  renewals: CompanyPanelState<CompanyRenewalRow[]>;
  payments: CompanyPanelState<CompanyInvoiceRow[]>;
  activity: CompanyPanelState<CompanyActivityRow[]>;
};

type FocusedRows<T> = { rows: T[]; focusedId?: string };

type CompanyWorkspaceFocus = {
  tab: 'overview' | 'documents' | 'renewals' | 'payments' | 'activity';
  documentId?: string;
  requestId?: string;
};

type CompanyWorkspaceLoaders = {
  documents: (
    tenantId: string,
    companyId: string,
    focusedDocumentId?: string,
  ) => Promise<FocusedRows<CompanyDocumentRow>>;
  requests: (
    tenantId: string,
    companyId: string,
    focusedRequestId?: string,
  ) => Promise<FocusedRows<CompanyDocumentRequestRow>>;
  renewals: (tenantId: string, companyId: string) => Promise<CompanyRenewalRow[]>;
  payments: (tenantId: string, companyId: string) => Promise<CompanyInvoiceRow[]>;
  activity: (tenantId: string, companyId: string) => Promise<CompanyActivityRow[]>;
};

const defaultLoaders: CompanyWorkspaceLoaders = {
  documents: loadCompanyDocuments,
  requests: loadCompanyDocumentRequests,
  renewals: loadCompanyRenewals,
  payments: loadCompanyInvoices,
  activity: loadCompanyActivity,
};

export async function loadAssignedCompanyWorkspace(
  tenantId: string,
  companyId: string,
  focus: CompanyWorkspaceFocus,
  loaders: CompanyWorkspaceLoaders = defaultLoaders,
): Promise<CompanyWorkspace> {
  const workspace: CompanyWorkspace = {
    documents: { status: 'unrequested' },
    requests: { status: 'unrequested' },
    renewals: { status: 'unrequested' },
    payments: { status: 'unrequested' },
    activity: { status: 'unrequested' },
  };

  if (focus.tab === 'documents') {
    const [documents, requests] = await Promise.allSettled([
      loaders.documents(tenantId, companyId, focus.documentId),
      loaders.requests(tenantId, companyId, focus.requestId),
    ]);
    workspace.documents = focusedPanelState(documents);
    workspace.requests = focusedPanelState(requests);
  } else if (focus.tab === 'renewals') {
    workspace.renewals = await panelState(loaders.renewals(tenantId, companyId));
  } else if (focus.tab === 'payments') {
    workspace.payments = await panelState(loaders.payments(tenantId, companyId));
  } else if (focus.tab === 'activity') {
    workspace.activity = await panelState(loaders.activity(tenantId, companyId));
  }

  return workspace;
}

function focusedPanelState<T>(
  result: PromiseSettledResult<FocusedRows<T>>,
): CompanyPanelState<T[]> {
  if (result.status === 'rejected') return { status: 'error' };
  return result.value.focusedId
    ? { status: 'ready', data: result.value.rows, focusedId: result.value.focusedId }
    : { status: 'ready', data: result.value.rows };
}

async function panelState<T>(promise: Promise<T[]>): Promise<CompanyPanelState<T[]>> {
  try {
    return { status: 'ready', data: await promise };
  } catch {
    return { status: 'error' };
  }
}

export function mergeFocusedRow<T extends { id: string }>(
  rows: T[],
  focused: T | null,
  limit: number,
): T[] {
  if (!focused) return rows.slice(0, limit);
  return [focused, ...rows.filter((row) => row.id !== focused.id)].slice(0, limit);
}

async function loadCompanyDocuments(
  tenantId: string,
  companyId: string,
  focusedDocumentId?: string,
): Promise<FocusedRows<CompanyDocumentRow>> {
  const admin = createSupabaseServiceRoleClient();
  const listPromise = admin
    .from('documents')
    .select('id, doc_type, label, expires_on, updated_at')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(PANEL_LIMIT);
  const focusPromise = focusedDocumentId
    ? admin
        .from('documents')
        .select('id, doc_type, label, expires_on, updated_at')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('id', focusedDocumentId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [list, exact] = await Promise.all([listPromise, focusPromise]);
  if (list.error || exact.error) throw new Error('COMPANY_DOCUMENTS_UNAVAILABLE');
  const rows = (list.data ?? []).map(toCompanyDocumentRow);
  const focused = exact.data ? toCompanyDocumentRow(exact.data) : null;
  return {
    rows: mergeFocusedRow(rows, focused, PANEL_LIMIT),
    focusedId: focused?.id,
  };
}

function toCompanyDocumentRow(row: Record<string, unknown>): CompanyDocumentRow {
  return {
    id: row.id as string,
    docType: row.doc_type as string,
    label: (row.label as string | null) ?? null,
    expiresOn: (row.expires_on as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

async function loadCompanyDocumentRequests(
  tenantId: string,
  companyId: string,
  focusedRequestId?: string,
): Promise<FocusedRows<CompanyDocumentRequestRow>> {
  const admin = createSupabaseServiceRoleClient();
  const listPromise = admin
    .from('document_requests')
    .select('id, doc_type, label, due_at, created_at')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(PANEL_LIMIT);
  const focusPromise = focusedRequestId
    ? admin
        .from('document_requests')
        .select('id, doc_type, label, due_at, created_at')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('id', focusedRequestId)
        .eq('status', 'pending')
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [list, exact] = await Promise.all([listPromise, focusPromise]);
  if (list.error || exact.error) throw new Error('COMPANY_DOCUMENT_REQUESTS_UNAVAILABLE');
  const rows = (list.data ?? []).map(toCompanyDocumentRequestRow);
  const focused = exact.data ? toCompanyDocumentRequestRow(exact.data) : null;
  return {
    rows: mergeFocusedRow(rows, focused, PANEL_LIMIT),
    focusedId: focused?.id,
  };
}

function toCompanyDocumentRequestRow(row: Record<string, unknown>): CompanyDocumentRequestRow {
  return {
    id: row.id as string,
    docType: row.doc_type as string,
    label: row.label as string,
    dueAt: (row.due_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

async function loadCompanyRenewals(
  tenantId: string,
  companyId: string,
): Promise<CompanyRenewalRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('renewals')
    .select('id, type, label, due_date, status')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(PANEL_LIMIT);
  if (error) throw new Error('COMPANY_RENEWALS_UNAVAILABLE');
  return (data ?? []).map((row) => ({
    id: row.id as string,
    type: row.type as string,
    label: row.label as string,
    dueDate: row.due_date as string,
    status: row.status as string,
  }));
}

async function loadCompanyInvoices(
  tenantId: string,
  companyId: string,
): Promise<CompanyInvoiceRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('invoices')
    .select('id, label, amount_minor, currency, status, due_at, paid_at, created_at')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(PANEL_LIMIT);
  if (error) throw new Error('COMPANY_INVOICES_UNAVAILABLE');
  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    amountMinor: row.amount_minor as number,
    currency: row.currency as string,
    status: row.status as string,
    dueAt: (row.due_at as string | null) ?? null,
    paidAt: (row.paid_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

async function loadCompanyActivity(
  tenantId: string,
  companyId: string,
): Promise<CompanyActivityRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('tenant_audit_log')
    .select('id, action, source, created_at')
    .eq('tenant_id', tenantId)
    .contains('details', { company_id: companyId })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PANEL_LIMIT);
  if (error) throw new Error('COMPANY_ACTIVITY_UNAVAILABLE');
  return (data ?? []).map((row) => ({
    id: String(row.id),
    action: row.action as string,
    source: row.source as string,
    createdAt: row.created_at as string,
  }));
}
