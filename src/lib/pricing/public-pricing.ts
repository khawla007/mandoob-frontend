export const PUBLIC_PRICING_SOURCE_STATES = [
  'live',
  'approved-static',
  'illustrative',
  'unavailable',
] as const;

export type PublicPricingSourceState = (typeof PUBLIC_PRICING_SOURCE_STATES)[number];

export type PublicPricingSource =
  | { state: 'live'; source: string }
  | { state: 'approved-static'; source: string }
  | { state: 'illustrative'; label: string }
  | { state: 'unavailable'; reason: string };

// No exact public price source is accepted yet. Adding an ID requires accepted evidence first.
export const ACCEPTED_NUMERIC_PRICE_SOURCE_IDS = Object.freeze([] as const);
export type AcceptedNumericPriceSourceId = (typeof ACCEPTED_NUMERIC_PRICE_SOURCE_IDS)[number];

type NumericPublicPrice =
  | {
      state: 'live' | 'approved-static';
      sourceId: AcceptedNumericPriceSourceId;
      currency: 'AED';
      minorUnits: number;
    }
  | {
      state: 'illustrative';
      label: string;
      currency: 'AED';
      minorUnits: number;
    };

export type PublicPrice =
  | NumericPublicPrice
  | { state: 'unavailable'; display: 'Price on request'; reason: string };

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type PublicPricingTierIdentity =
  | { id: 'starter'; name: 'Starter' }
  | { id: 'professional'; name: 'Professional' }
  | { id: 'enterprise'; name: 'Enterprise' };

type PublicPricingTierDetails = {
  source: PublicPricingSource;
  price: PublicPrice;
  activeCompanyLimit: 1;
  companyPolicy: 'At most one active Company per PRO';
  cadences: readonly {
    name: 'monthly' | 'annual';
    concept: Extract<PublicPricingSource, { state: 'approved-static' }>;
    availability: {
      state: 'unavailable';
      display: 'Subject to confirmation';
      reason: string;
    };
  }[];
  categories: readonly PublicPricingCategory[];
};

export type PublicPricingTier = DeepReadonly<PublicPricingTierIdentity & PublicPricingTierDetails>;

export type PublicPricingCategory =
  | 'Platform features'
  | 'Storage and documents'
  | 'Communication allowances'
  | 'Reporting and audit visibility'
  | 'Support';

type CostBoundary = {
  source: PublicPricingSource;
  categories: readonly string[];
  price: Extract<PublicPrice, { state: 'unavailable' }>;
};

export type PublicPricingContract = DeepReadonly<{
  tiers: readonly PublicPricingTier[];
  differentiationCategories: readonly PublicPricingCategory[];
  addOns: readonly {
    category: 'Communication usage';
    source: PublicPricingSource;
    price: Extract<PublicPrice, { state: 'unavailable' }>;
  }[];
  costBoundaries: {
    softwareAccess: {
      inPlan: true;
      source: PublicPricingSource;
      categories: readonly ['Workspace access'];
    };
    governmentAndAuthority: CostBoundary;
    thirdParty: CostBoundary;
    variabilityNotice: string;
  };
}>;

function approvedStaticSource() {
  return {
    state: 'approved-static',
    source: 'P1.06 frozen claim contract',
  } as const satisfies PublicPricingSource;
}

function priceOnRequest() {
  return {
    state: 'unavailable',
    display: 'Price on request',
    reason: 'No approved exact public amount exists',
  } as const satisfies PublicPrice;
}

function cadenceAvailability() {
  return {
    state: 'unavailable',
    display: 'Subject to confirmation',
    reason: 'Current monthly and annual availability is not approved for publication',
  } as const;
}

const DIFFERENTIATION_CATEGORIES = [
  'Platform features',
  'Storage and documents',
  'Communication allowances',
  'Reporting and audit visibility',
  'Support',
] as const satisfies readonly PublicPricingCategory[];

function createTier<const Identity extends PublicPricingTierIdentity>(
  identity: Identity,
): Identity & PublicPricingTierDetails {
  return {
    ...identity,
    source: approvedStaticSource(),
    price: priceOnRequest(),
    activeCompanyLimit: 1,
    companyPolicy: 'At most one active Company per PRO',
    cadences: [
      {
        name: 'monthly',
        concept: approvedStaticSource(),
        availability: cadenceAvailability(),
      },
      {
        name: 'annual',
        concept: approvedStaticSource(),
        availability: cadenceAvailability(),
      },
    ],
    categories: [...DIFFERENTIATION_CATEGORIES],
  };
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value) as DeepReadonly<T>;
}

export const PUBLIC_PRICING_CONTRACT = deepFreeze({
  tiers: [
    createTier({ id: 'starter', name: 'Starter' }),
    createTier({ id: 'professional', name: 'Professional' }),
    createTier({ id: 'enterprise', name: 'Enterprise' }),
  ],
  differentiationCategories: [...DIFFERENTIATION_CATEGORIES],
  addOns: [
    {
      category: 'Communication usage',
      source: approvedStaticSource(),
      price: priceOnRequest(),
    },
  ],
  costBoundaries: {
    softwareAccess: {
      inPlan: true,
      source: approvedStaticSource(),
      categories: ['Workspace access'],
    },
    governmentAndAuthority: {
      source: approvedStaticSource(),
      categories: [
        'Company registration',
        'Government and authority fees',
        'Visa, medical, and Emirates ID',
      ],
      price: priceOnRequest(),
    },
    thirdParty: {
      source: approvedStaticSource(),
      categories: [
        'Office',
        'Banking',
        'Tax and VAT',
        'Translation and attestation',
        'Payment-provider charges',
        'Communication usage',
        'Optional professional services',
      ],
      price: priceOnRequest(),
    },
    variabilityNotice:
      'Government and third-party costs vary by jurisdiction, activity, office, visa, approval, provider, and current authority schedules.',
  },
} satisfies PublicPricingContract);

const aed = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
  currencyDisplay: 'code',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPublicPrice(price: PublicPrice): string {
  if (price.state === 'unavailable') return price.display;
  if (price.state === 'illustrative') {
    if (!price.label.trim())
      throw new Error('Numeric pricing requires a nonempty illustrative label');
  } else if (!(ACCEPTED_NUMERIC_PRICE_SOURCE_IDS as readonly string[]).includes(price.sourceId)) {
    throw new Error('Numeric public pricing requires an accepted numeric price source');
  }
  if (price.currency !== 'AED') throw new Error('Numeric public pricing must use AED');
  if (!Number.isSafeInteger(price.minorUnits) || price.minorUnits < 0) {
    throw new Error('Numeric public pricing must use nonnegative safe integer minor units');
  }

  const formatted = aed.format(price.minorUnits / 100).replace(/\u00a0/gu, ' ');
  return price.state === 'illustrative' ? `${price.label.trim()}: ${formatted}` : formatted;
}
