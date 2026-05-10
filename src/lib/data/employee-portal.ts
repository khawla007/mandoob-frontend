import 'server-only';
import { ApiError } from '@/lib/errors';
import { decryptOptional } from '@/lib/crypto/pii';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { employeeNotificationPreferencesSchema } from '@/lib/validation/employee-portal';

const SIGNED_URL_TTL_SECONDS = 300;

export type ExpiryBucket = 'missing' | 'expired' | 'critical' | 'soon' | 'ok';

export type EmployeeOwnerRow = {
  id: string;
  tenant_id: string;
  profile_id: string | null;
  status: string;
};

type EmployeeRow = EmployeeOwnerRow & {
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  passport_no_encrypted: string | null;
  visa_no_encrypted: string | null;
  visa_expiry: string | null;
  emirates_id_encrypted: string | null;
  eid_expiry: string | null;
  clients?: { company_name: string | null } | { company_name: string | null }[] | null;
};

type DocumentRow = {
  id: string;
  doc_type: string;
  label: string | null;
  created_at: string;
  currentVersion?:
    | {
        id: string;
        review_status: string;
        created_at: string;
        mime_type: string;
        size_bytes: number;
      }
    | {
        id: string;
        review_status: string;
        created_at: string;
        mime_type: string;
        size_bytes: number;
      }[]
    | null;
};

type DocumentVersionView = {
    id: string;
    review_status: string;
    created_at: string;
    mime_type: string;
    size_bytes: number;
};

export type EmployeePortalSummary = {
  employeeId: string;
  employeeName: string;
  clientName: string | null;
  visaExpiry: string | null;
  visaDaysOut: number | null;
  visaBucket: ExpiryBucket;
  eidExpiry: string | null;
  eidDaysOut: number | null;
  eidBucket: ExpiryBucket;
  documentCount: number;
  approvedDocumentCount: number;
  renewalRemindersEnabled: boolean;
};

export type EmployeeIdentity = {
  employeeId: string;
  employeeName: string;
  clientName: string | null;
  nationality: string | null;
  passportNo: string | null;
  visaNo: string | null;
  visaExpiry: string | null;
  visaDaysOut: number | null;
  visaBucket: ExpiryBucket;
  emiratesId: string | null;
  eidExpiry: string | null;
  eidDaysOut: number | null;
  eidBucket: ExpiryBucket;
};

export type EmployeeDocument = {
  id: string;
  versionId: string | null;
  docType: string;
  label: string;
  reviewStatus: string | null;
  uploadedAt: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

function companyName(row: EmployeeRow): string | null {
  const joined = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  return joined?.company_name ?? null;
}

function currentVersion(row: DocumentRow): DocumentVersionView | null {
  if (Array.isArray(row.currentVersion)) return row.currentVersion[0] ?? null;
  return row.currentVersion ?? null;
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function daysUntilExpiry(expiryDate: string | null, today = new Date()): number | null {
  if (!expiryDate) return null;
  const due = new Date(`${expiryDate}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((startOfUtcDay(due) - startOfUtcDay(today)) / 86_400_000);
}

export function expiryBucket(daysOut: number | null): ExpiryBucket {
  if (daysOut === null) return 'missing';
  if (daysOut < 0) return 'expired';
  if (daysOut <= 30) return 'critical';
  if (daysOut <= 90) return 'soon';
  return 'ok';
}

export function assertOwnedActiveEmployee(
  employee: EmployeeOwnerRow | null,
  actorProfileId: string,
  tenantId: string,
): asserts employee is EmployeeOwnerRow {
  if (!employee) throw new ApiError('NOT_FOUND', 'Employee record not found', 404);
  if (employee.tenant_id !== tenantId || employee.profile_id !== actorProfileId) {
    throw new ApiError('FORBIDDEN', 'Employee record is not accessible', 403);
  }
  if (employee.status !== 'active') {
    throw new ApiError('FORBIDDEN', 'Employee portal is not active', 403);
  }
}

async function getOwnedEmployee(actorProfileId: string, tenantId: string): Promise<EmployeeRow> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('employees')
    .select(
      'id, tenant_id, client_id, profile_id, name, email, phone, nationality, passport_no_encrypted, visa_no_encrypted, visa_expiry, emirates_id_encrypted, eid_expiry, status, clients(company_name)',
    )
    .eq('profile_id', actorProfileId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  assertOwnedActiveEmployee((data as EmployeeRow | null) ?? null, actorProfileId, tenantId);
  return data as EmployeeRow;
}

async function getPreference(employee: EmployeeRow): Promise<boolean> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('employee_notification_preferences')
    .select('renewal_reminders_enabled')
    .eq('employee_id', employee.id)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return (data?.renewal_reminders_enabled as boolean | null) ?? true;
}

export async function getEmployeePortalSummary(
  actorProfileId: string,
  tenantId: string,
): Promise<EmployeePortalSummary> {
  const employee = await getOwnedEmployee(actorProfileId, tenantId);
  const admin = createSupabaseServiceRoleClient();
  const [{ count: documentCount, error: docCountError }, { count: approvedCount, error: approvedError }, reminders] =
    await Promise.all([
      admin
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('employee_id', employee.id),
      admin
        .from('documents')
        .select('id, currentVersion:document_versions!documents_current_version_fk(review_status)', {
          count: 'exact',
          head: true,
        })
        .eq('tenant_id', tenantId)
        .eq('employee_id', employee.id)
        .eq('document_versions.review_status', 'approved'),
      getPreference(employee),
    ]);
  if (docCountError) throw new ApiError('INTERNAL', docCountError.message, 500);
  if (approvedError) throw new ApiError('INTERNAL', approvedError.message, 500);

  const visaDaysOut = daysUntilExpiry(employee.visa_expiry);
  const eidDaysOut = daysUntilExpiry(employee.eid_expiry);
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    clientName: companyName(employee),
    visaExpiry: employee.visa_expiry,
    visaDaysOut,
    visaBucket: expiryBucket(visaDaysOut),
    eidExpiry: employee.eid_expiry,
    eidDaysOut,
    eidBucket: expiryBucket(eidDaysOut),
    documentCount: documentCount ?? 0,
    approvedDocumentCount: approvedCount ?? 0,
    renewalRemindersEnabled: reminders,
  };
}

export async function getEmployeeIdentity(
  actorProfileId: string,
  tenantId: string,
): Promise<EmployeeIdentity> {
  const employee = await getOwnedEmployee(actorProfileId, tenantId);
  const visaDaysOut = daysUntilExpiry(employee.visa_expiry);
  const eidDaysOut = daysUntilExpiry(employee.eid_expiry);
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    clientName: companyName(employee),
    nationality: employee.nationality,
    passportNo: decryptOptional(employee.passport_no_encrypted),
    visaNo: decryptOptional(employee.visa_no_encrypted),
    visaExpiry: employee.visa_expiry,
    visaDaysOut,
    visaBucket: expiryBucket(visaDaysOut),
    emiratesId: decryptOptional(employee.emirates_id_encrypted),
    eidExpiry: employee.eid_expiry,
    eidDaysOut,
    eidBucket: expiryBucket(eidDaysOut),
  };
}

export async function listEmployeeDocuments(
  actorProfileId: string,
  tenantId: string,
): Promise<EmployeeDocument[]> {
  const employee = await getOwnedEmployee(actorProfileId, tenantId);
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('documents')
    .select(
      'id, doc_type, label, created_at, currentVersion:document_versions!documents_current_version_fk(id, review_status, created_at, mime_type, size_bytes)',
    )
    .eq('tenant_id', tenantId)
    .eq('employee_id', employee.id)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return (((data as unknown as DocumentRow[] | null) ?? [])).map((doc) => {
    const version = currentVersion(doc);
    return {
      id: doc.id,
      versionId: version?.id ?? null,
      docType: doc.doc_type,
      label: doc.label ?? doc.doc_type.replaceAll('_', ' '),
      reviewStatus: version?.review_status ?? null,
      uploadedAt: version?.created_at ?? doc.created_at,
      mimeType: version?.mime_type ?? null,
      sizeBytes: version?.size_bytes ?? null,
    };
  });
}

export async function getEmployeeDocumentSignedUrl(
  actorProfileId: string,
  tenantId: string,
  versionId: string,
): Promise<string> {
  const employee = await getOwnedEmployee(actorProfileId, tenantId);
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('document_versions')
    .select('id, tenant_id, storage_path, documents!inner(id, tenant_id, employee_id)')
    .eq('id', versionId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  const row = data as
    | {
        storage_path: string;
        documents:
          | { tenant_id: string; employee_id: string | null }
          | { tenant_id: string; employee_id: string | null }[];
      }
    | null;
  const doc = Array.isArray(row?.documents) ? row?.documents[0] : row?.documents;
  if (!row || !doc || doc.tenant_id !== tenantId || doc.employee_id !== employee.id) {
    throw new ApiError('FORBIDDEN', 'Document is not accessible', 403);
  }

  const { data: signed, error: signError } = await admin.storage
    .from('tenant-documents')
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    throw new ApiError('INTERNAL', signError?.message ?? 'Could not create signed URL', 500);
  }
  return signed.signedUrl;
}

export async function getEmployeeNotificationPreferences(
  actorProfileId: string,
  tenantId: string,
): Promise<{ renewalRemindersEnabled: boolean }> {
  const employee = await getOwnedEmployee(actorProfileId, tenantId);
  return { renewalRemindersEnabled: await getPreference(employee) };
}

export async function updateEmployeeNotificationPreferences(
  actorProfileId: string,
  tenantId: string,
  input: unknown,
): Promise<{ renewalRemindersEnabled: boolean }> {
  const parsed = employeeNotificationPreferencesSchema.parse(input);
  const employee = await getOwnedEmployee(actorProfileId, tenantId);
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from('employee_notification_preferences').upsert(
    {
      tenant_id: tenantId,
      employee_id: employee.id,
      profile_id: actorProfileId,
      renewal_reminders_enabled: parsed.renewal_reminders_enabled,
    },
    { onConflict: 'employee_id' },
  );
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return { renewalRemindersEnabled: parsed.renewal_reminders_enabled };
}
