import 'server-only';

import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type RenewalWorkspaceContext = {
  evidence: Array<{ id: string; label: string }>;
  employees: Array<{ id: string; name: string }>;
};

/**
 * Picker options for an already-authorized company. Evidence is limited to
 * uploaded company documents (the RPC re-checks ownership and version).
 */
export async function loadRenewalWorkspaceContext(access: {
  tenantId: string;
  companyId: string;
}): Promise<RenewalWorkspaceContext> {
  const admin = createSupabaseServiceRoleClient();
  const [documents, employees] = await Promise.all([
    admin
      .from('documents')
      .select('id, doc_type, label, document_versions!document_versions_document_id_fkey!inner(id)')
      .eq('tenant_id', access.tenantId)
      .eq('company_id', access.companyId)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('employees')
      .select('id, name')
      .eq('tenant_id', access.tenantId)
      .eq('company_id', access.companyId)
      .eq('status', 'active')
      .order('name', { ascending: true })
      .limit(500),
  ]);
  return {
    evidence: (documents.error ? [] : (documents.data ?? [])).map((row) => ({
      id: row.id as string,
      label: `${String(row.label ?? row.doc_type)} · ${String(row.id).slice(0, 8)}`,
    })),
    employees: (employees.error ? [] : (employees.data ?? [])).map((row) => ({
      id: row.id as string,
      name: row.name as string,
    })),
  };
}
