export type CatalogClass = 'demo' | 'local' | 'commercial';
export type CatalogDestination = 'local' | 'test' | 'sandbox' | 'live' | 'production';
export type PlanKey = 'starter' | 'professional' | 'enterprise';
export type BillingCadence = 'monthly' | 'annual';
export type NumericAllowance = 'employees' | 'storageBytes' | 'invoices' | 'sms' | 'whatsapp';

export type PlanAllowances = Record<NumericAllowance, number> & { advancedReports: boolean };
export type CatalogDefinition = {
  key: string;
  catalogClass: CatalogClass;
  currency: string;
  plans: Record<
    PlanKey,
    {
      monthlyAmountMinor: number;
      annualAmountMinor: number;
      allowances: PlanAllowances;
    }
  >;
  addons: Record<
    string,
    {
      allowance: NumericAllowance;
      delta: number;
      monthlyAmountMinor: number;
      annualAmountMinor: number;
    }
  >;
};

const gib = 1024 ** 3;
export const DEMO_CATALOG: CatalogDefinition = {
  key: 'p309-demo-aed-v1',
  catalogClass: 'demo',
  currency: 'AED',
  plans: {
    starter: {
      monthlyAmountMinor: 19_900,
      annualAmountMinor: 199_000,
      allowances: {
        employees: 25,
        storageBytes: 5 * gib,
        invoices: 50,
        sms: 0,
        whatsapp: 0,
        advancedReports: false,
      },
    },
    professional: {
      monthlyAmountMinor: 49_900,
      annualAmountMinor: 499_000,
      allowances: {
        employees: 100,
        storageBytes: 25 * gib,
        invoices: 250,
        sms: 500,
        whatsapp: 500,
        advancedReports: true,
      },
    },
    enterprise: {
      monthlyAmountMinor: 99_900,
      annualAmountMinor: 999_000,
      allowances: {
        employees: 500,
        storageBytes: 100 * gib,
        invoices: 1_000,
        sms: 2_500,
        whatsapp: 2_500,
        advancedReports: true,
      },
    },
  },
  addons: {
    employee_pack_25: {
      allowance: 'employees',
      delta: 25,
      monthlyAmountMinor: 5_000,
      annualAmountMinor: 50_000,
    },
    storage_pack_10_gib: {
      allowance: 'storageBytes',
      delta: 10 * gib,
      monthlyAmountMinor: 3_000,
      annualAmountMinor: 30_000,
    },
    sms_pack_100: {
      allowance: 'sms',
      delta: 100,
      monthlyAmountMinor: 2_000,
      annualAmountMinor: 20_000,
    },
    whatsapp_pack_100: {
      allowance: 'whatsapp',
      delta: 100,
      monthlyAmountMinor: 3_000,
      annualAmountMinor: 30_000,
    },
  },
};

export type Availability =
  | { available: true }
  | {
      available: false;
      reason:
        | 'live_demo_forbidden'
        | 'production_local_forbidden'
        | 'provider_disabled'
        | 'mapping_missing_or_mismatched';
    };

export function evaluateCatalogAvailability(
  catalog: CatalogDefinition,
  destination: CatalogDestination,
  explicitlyEnabled: boolean,
): Availability {
  if ((destination === 'live' || destination === 'production') && catalog.catalogClass === 'demo')
    return { available: false, reason: 'live_demo_forbidden' };
  if (destination === 'production' && catalog.catalogClass === 'local')
    return { available: false, reason: 'production_local_forbidden' };
  if (
    (destination === 'sandbox' || destination === 'live' || destination === 'production') &&
    !explicitlyEnabled
  )
    return { available: false, reason: 'provider_disabled' };
  return { available: true };
}

export type ProviderPriceMapping = {
  provider: 'stripe';
  destination: CatalogDestination;
  catalogKey: string;
  plan: PlanKey;
  cadence: BillingCadence;
  providerPriceId: string;
  currency: string;
  amountMinor: number;
  interval: 'month' | 'year';
};

export function resolveProviderPrice(input: {
  catalog: CatalogDefinition;
  provider: 'stripe' | 'tap';
  destination: CatalogDestination;
  plan: PlanKey;
  cadence: BillingCadence;
  enabled: boolean;
  mappings: ProviderPriceMapping[];
}): Availability & { providerPriceId?: string | null } {
  const availability = evaluateCatalogAvailability(input.catalog, input.destination, input.enabled);
  if (!availability.available) return availability;
  if (input.provider === 'tap') return { available: true, providerPriceId: null };
  const plan = input.catalog.plans[input.plan];
  const amountMinor =
    input.cadence === 'monthly' ? plan.monthlyAmountMinor : plan.annualAmountMinor;
  const interval = input.cadence === 'monthly' ? 'month' : 'year';
  const mapping = input.mappings.find(
    (candidate) =>
      candidate.provider === 'stripe' &&
      candidate.destination === input.destination &&
      candidate.catalogKey === input.catalog.key &&
      candidate.plan === input.plan &&
      candidate.cadence === input.cadence &&
      candidate.currency === input.catalog.currency &&
      candidate.amountMinor === amountMinor &&
      candidate.interval === interval,
  );
  return mapping
    ? { available: true, providerPriceId: mapping.providerPriceId }
    : { available: false, reason: 'mapping_missing_or_mismatched' };
}
