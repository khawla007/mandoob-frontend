import 'server-only';

export type InvoiceCustomerOption = { id: string; label: string };
type StoreResult<T> = { data: T | null; error: unknown | null };
export type InvoiceCustomerOptionStore = {
  linked(companyId: string): Promise<StoreResult<Array<{ profileId: string }>>>;
  active(
    tenantId: string,
    profileIds: string[],
  ): Promise<StoreResult<Array<{ id: string; fullName: string | null }>>>;
};

const MAX_INVOICE_CUSTOMERS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function listActiveInvoiceCustomerOptions(
  tenantId: string,
  companyId: string,
  store?: InvoiceCustomerOptionStore,
): Promise<InvoiceCustomerOption[]> {
  const source = store ?? (await createSupabaseInvoiceCustomerOptionStore());
  const linked = await source.linked(companyId).catch(() => ({ data: null, error: true }));
  if (linked.error || !linked.data || linked.data.length > MAX_INVOICE_CUSTOMERS) return [];
  const profileIds = [...new Set(linked.data.map(({ profileId }) => profileId))];
  if (profileIds.length === 0 || profileIds.some((id) => !UUID.test(id))) return [];
  const active = await source
    .active(tenantId, profileIds)
    .catch(() => ({ data: null, error: true }));
  if (active.error || !active.data || active.data.length > MAX_INVOICE_CUSTOMERS) return [];
  const linkedIds = new Set(profileIds);
  if (active.data.some(({ id }) => !linkedIds.has(id) || !UUID.test(id))) return [];
  return active.data
    .map(({ id, fullName }) => ({
      id,
      label: safeLabel(fullName, id),
    }))
    .sort(
      (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
    );
}

function safeLabel(fullName: string | null, id: string) {
  const normalized = fullName?.trim().slice(0, 160);
  return normalized || `Customer ${id.slice(0, 8)}`;
}

async function createSupabaseInvoiceCustomerOptionStore(): Promise<InvoiceCustomerOptionStore> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  return {
    linked: async (companyId) => {
      const { data, error } = await admin
        .from('customer_profiles')
        .select('profile_id')
        .eq('linked_company_id', companyId)
        .order('profile_id', { ascending: true })
        .limit(MAX_INVOICE_CUSTOMERS + 1);
      return {
        data: data?.map(({ profile_id }) => ({ profileId: profile_id })) ?? null,
        error,
      };
    },
    active: async (tenantId, profileIds) => {
      const { data, error } = await admin
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', tenantId)
        .eq('role', 'customer')
        .eq('status', 'active')
        .in('id', profileIds)
        .order('full_name', { ascending: true })
        .order('id', { ascending: true })
        .limit(MAX_INVOICE_CUSTOMERS);
      return {
        data: data?.map(({ id, full_name }) => ({ id, fullName: full_name })) ?? null,
        error,
      };
    },
  };
}
