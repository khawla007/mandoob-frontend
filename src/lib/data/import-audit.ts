export type BulkImportedAuditRecord = {
  tenant_id: string;
  actor_id: string;
  action: 'bulk_imported';
  source: 'self_serve';
  details: Record<string, string | number> & { company_id: string };
};

export async function finalizeBulkImportSuccess<T>(
  success: { ok: true; data: T },
  input: {
    tenantId: string;
    actorId: string;
    companyId: string;
    details: Record<string, string | number>;
    write: (record: BulkImportedAuditRecord) => Promise<unknown>;
  },
): Promise<{ ok: true; data: T }> {
  try {
    await input.write({
      tenant_id: input.tenantId,
      actor_id: input.actorId,
      action: 'bulk_imported',
      source: 'self_serve',
      details: { company_id: input.companyId, ...input.details },
    });
  } catch {
    console.error('bulk-import.audit failed');
  }
  return success;
}
