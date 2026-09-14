import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CustomerWidgetState } from '@/lib/customer/customer-overview';
import type { CustomerCompanyAccess } from './customer-company-access';

type QueryResult<T> = { data: T | null; error: unknown };

export const CUSTOMER_COMPANY_COLLECTION_LIMIT = 100;

type LegalRow = {
  company_name: string;
  display_name: string | null;
  jurisdiction_type: string | null;
  licensing_authority: string | null;
  legal_structure: string | null;
  trade_license_no: string | null;
  license_expiry: string | null;
};
type ShareholderRow = {
  id: string;
  kind: 'individual' | 'company';
  full_name: string | null;
  legal_name: string | null;
  nationality_code: string | null;
  country_of_incorporation: string | null;
  ownership_percent: number;
  passport_no_last4: string | null;
  registration_no_last4: string | null;
};
type ActivityRow = {
  id: string;
  activity_code: string;
  activity_name: string;
  authority_name: string;
  is_primary: boolean;
};
type OfficeRow = {
  office_type: string;
  address_line_1: string | null;
  address_line_2: string | null;
  area: string | null;
  city: string | null;
  emirate: string | null;
  postal_code: string | null;
  country_code: string;
  provider_name: string | null;
  lease_expiry: string | null;
};
type EstablishmentRow = {
  establishment_card_no_last4: string | null;
  establishment_card_expiry: string | null;
};
type BankRow = {
  bank_name: string;
  account_holder_name: string;
  currency_code: string;
  iban_last4: string | null;
  account_number_last4: string | null;
};
type LifecycleRow = { status: string };
type OnboardingRow = { onboarding_status: string };

export type CustomerCompanyDisplayStore = {
  legalIdentity: (tenantId: string, companyId: string) => Promise<QueryResult<LegalRow>>;
  shareholders: (tenantId: string, companyId: string) => Promise<QueryResult<ShareholderRow[]>>;
  activities: (tenantId: string, companyId: string) => Promise<QueryResult<ActivityRow[]>>;
  office: (tenantId: string, companyId: string) => Promise<QueryResult<OfficeRow>>;
  establishment: (tenantId: string, companyId: string) => Promise<QueryResult<EstablishmentRow>>;
  bank: (tenantId: string, companyId: string) => Promise<QueryResult<BankRow>>;
  lifecycle: (tenantId: string, companyId: string) => Promise<QueryResult<LifecycleRow>>;
  onboarding: (tenantId: string, companyId: string) => Promise<QueryResult<OnboardingRow>>;
};

export function createCustomerCompanyDisplaySupabaseStore(
  client: Pick<SupabaseClient, 'from'>,
): CustomerCompanyDisplayStore {
  const company = (columns: string, tenantId: string, companyId: string) =>
    client
      .from('company_profiles')
      .select(columns)
      .eq('tenant_id', tenantId)
      .eq('id', companyId)
      .maybeSingle();
  return {
    legalIdentity: async (tenantId, companyId) =>
      await company(
        'company_name, display_name, jurisdiction_type, licensing_authority, legal_structure, trade_license_no, license_expiry',
        tenantId,
        companyId,
      ),
    shareholders: async (tenantId, companyId) =>
      await client
        .from('company_shareholders')
        .select(
          'id, kind, full_name, legal_name, nationality_code, country_of_incorporation, ownership_percent, passport_no_last4, registration_no_last4',
        )
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .limit(CUSTOMER_COMPANY_COLLECTION_LIMIT + 1),
    activities: async (tenantId, companyId) =>
      await client
        .from('company_registered_activities')
        .select('id, activity_code, activity_name, authority_name, is_primary')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .limit(CUSTOMER_COMPANY_COLLECTION_LIMIT + 1),
    office: async (tenantId, companyId) =>
      await client
        .from('company_office_details')
        .select(
          'office_type, address_line_1, address_line_2, area, city, emirate, postal_code, country_code, provider_name, lease_expiry',
        )
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .maybeSingle(),
    establishment: async (tenantId, companyId) =>
      await company('establishment_card_no_last4, establishment_card_expiry', tenantId, companyId),
    bank: async (tenantId, companyId) =>
      await client
        .from('company_bank_details')
        .select('bank_name, account_holder_name, currency_code, iban_last4, account_number_last4')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .maybeSingle(),
    lifecycle: async (tenantId, companyId) => await company('status', tenantId, companyId),
    onboarding: async (tenantId, companyId) =>
      await company('onboarding_status', tenantId, companyId),
  } as CustomerCompanyDisplayStore;
}

function maskLast4(value: string | null): string | null {
  return value && /^[A-Za-z0-9]{1,4}$/u.test(value) ? `•••• ${value}` : null;
}

async function state<T, U>(
  source: Promise<QueryResult<T>>,
  map: (value: T) => U,
): Promise<CustomerWidgetState<U>> {
  try {
    const result = await source;
    if (result.error) return { kind: 'error' };
    if (result.data === null) return { kind: 'empty', value: null as U };
    if (Array.isArray(result.data) && result.data.length === 0) {
      return { kind: 'empty', value: map(result.data) };
    }
    return { kind: 'ready', value: map(result.data) };
  } catch {
    return { kind: 'error' };
  }
}

async function boundedCollectionState<T, U>(
  source: Promise<QueryResult<T[]>>,
  map: (value: T[]) => U,
): Promise<CustomerWidgetState<U>> {
  try {
    const result = await source;
    if (result.error) return { kind: 'error' };
    if (!result.data) return { kind: 'empty', value: map([]) };
    if (result.data.length > CUSTOMER_COMPANY_COLLECTION_LIMIT) {
      return { kind: 'unavailable' };
    }
    return result.data.length === 0
      ? { kind: 'empty', value: map([]) }
      : { kind: 'ready', value: map(result.data) };
  } catch {
    return { kind: 'error' };
  }
}

export async function loadCustomerCompanyDisplay(
  access: Extract<CustomerCompanyAccess, { kind: 'authorized' }>,
  dependencies: { store?: CustomerCompanyDisplayStore } = {},
) {
  const store = dependencies.store ?? (await defaultStore());
  const tenantId = access.tenant.id;
  const companyId = access.company.id;
  const [
    legalIdentity,
    shareholders,
    activities,
    office,
    establishment,
    bank,
    lifecycle,
    onboarding,
  ] = await Promise.all([
    state(store.legalIdentity(tenantId, companyId), (row) => ({
      companyName: row.company_name,
      displayName: row.display_name,
      jurisdictionType: row.jurisdiction_type,
      licensingAuthority: row.licensing_authority,
      legalStructure: row.legal_structure,
      tradeLicenseNumber: row.trade_license_no,
      licenseExpiry: row.license_expiry,
    })),
    boundedCollectionState(store.shareholders(tenantId, companyId), (rows) =>
      rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        displayName: row.kind === 'individual' ? row.full_name : row.legal_name,
        nationality:
          row.kind === 'individual' ? row.nationality_code : row.country_of_incorporation,
        ownershipPercent: row.ownership_percent,
        protectedIdentifier: maskLast4(
          row.kind === 'individual' ? row.passport_no_last4 : row.registration_no_last4,
        ),
      })),
    ),
    boundedCollectionState(store.activities(tenantId, companyId), (rows) =>
      rows.map((row) => ({
        id: row.id,
        code: row.activity_code,
        name: row.activity_name,
        authority: row.authority_name,
        isPrimary: row.is_primary,
      })),
    ),
    state(store.office(tenantId, companyId), (row) =>
      row
        ? {
            officeType: row.office_type,
            address: [row.address_line_1, row.address_line_2, row.area, row.city, row.emirate]
              .filter(Boolean)
              .join(', '),
            postalCode: row.postal_code,
            countryCode: row.country_code,
            providerName: row.provider_name,
            leaseExpiry: row.lease_expiry,
          }
        : null,
    ),
    state(store.establishment(tenantId, companyId), (row) =>
      row
        ? {
            cardMasked: maskLast4(row.establishment_card_no_last4),
            expiry: row.establishment_card_expiry,
          }
        : null,
    ),
    state(store.bank(tenantId, companyId), (row) =>
      row
        ? {
            bankName: row.bank_name,
            accountHolderName: row.account_holder_name,
            currencyCode: row.currency_code,
            ibanMasked: maskLast4(row.iban_last4),
            accountNumberMasked: maskLast4(row.account_number_last4),
          }
        : null,
    ),
    state(store.lifecycle(tenantId, companyId), (row) => row.status),
    state(store.onboarding(tenantId, companyId), (row) => row.onboarding_status),
  ]);
  return {
    legalIdentity,
    shareholders,
    activities,
    office,
    establishment,
    bank,
    lifecycle,
    onboarding,
    readiness: { kind: 'unavailable' } as const,
    deepWorkspace: { kind: 'unavailable' } as const,
  };
}

async function defaultStore(): Promise<CustomerCompanyDisplayStore> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createCustomerCompanyDisplaySupabaseStore(createSupabaseServiceRoleClient());
}
