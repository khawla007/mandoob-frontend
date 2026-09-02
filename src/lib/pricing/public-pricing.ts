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

type NumericPublicPrice =
  | {
      state: 'live' | 'approved-static';
      source: string;
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

export type PublicPricingTier = {
  id: 'starter' | 'professional' | 'enterprise';
  name: 'Starter' | 'Professional' | 'Enterprise';
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

export type PublicPricingContract = {
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
};

const APPROVED_STATIC_SOURCE = {
  state: 'approved-static',
  source: 'P1.06 frozen claim contract',
} as const satisfies PublicPricingSource;

const PRICE_ON_REQUEST = {
  state: 'unavailable',
  display: 'Price on request',
  reason: 'No approved exact public amount exists',
} as const satisfies PublicPrice;

const CADENCE_AVAILABILITY = {
  state: 'unavailable',
  display: 'Subject to confirmation',
  reason: 'Current monthly and annual availability is not approved for publication',
} as const;

const DIFFERENTIATION_CATEGORIES = [
  'Platform features',
  'Storage and documents',
  'Communication allowances',
  'Reporting and audit visibility',
  'Support',
] as const satisfies readonly PublicPricingCategory[];

function tier(id: PublicPricingTier['id'], name: PublicPricingTier['name']): PublicPricingTier {
  return {
    id,
    name,
    source: APPROVED_STATIC_SOURCE,
    price: PRICE_ON_REQUEST,
    activeCompanyLimit: 1,
    companyPolicy: 'At most one active Company per PRO',
    cadences: [
      {
        name: 'monthly',
        concept: APPROVED_STATIC_SOURCE,
        availability: CADENCE_AVAILABILITY,
      },
      {
        name: 'annual',
        concept: APPROVED_STATIC_SOURCE,
        availability: CADENCE_AVAILABILITY,
      },
    ],
    categories: DIFFERENTIATION_CATEGORIES,
  };
}

export const PUBLIC_PRICING_CONTRACT = {
  tiers: [
    tier('starter', 'Starter'),
    tier('professional', 'Professional'),
    tier('enterprise', 'Enterprise'),
  ],
  differentiationCategories: DIFFERENTIATION_CATEGORIES,
  addOns: [
    {
      category: 'Communication usage',
      source: APPROVED_STATIC_SOURCE,
      price: PRICE_ON_REQUEST,
    },
  ],
  costBoundaries: {
    softwareAccess: {
      inPlan: true,
      source: APPROVED_STATIC_SOURCE,
      categories: ['Workspace access'],
    },
    governmentAndAuthority: {
      source: APPROVED_STATIC_SOURCE,
      categories: [
        'Company registration',
        'Government and authority fees',
        'Visa, medical, and Emirates ID',
      ],
      price: PRICE_ON_REQUEST,
    },
    thirdParty: {
      source: APPROVED_STATIC_SOURCE,
      categories: [
        'Office',
        'Banking',
        'Tax and VAT',
        'Translation and attestation',
        'Payment-provider charges',
        'Communication usage',
        'Optional professional services',
      ],
      price: PRICE_ON_REQUEST,
    },
    variabilityNotice:
      'Government and third-party costs vary by jurisdiction, activity, office, visa, approval, provider, and current authority schedules.',
  },
} as const satisfies PublicPricingContract;

const aed = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
  currencyDisplay: 'code',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPublicPrice(price: PublicPrice): string {
  if (price.state === 'unavailable') return price.display;
  if (
    price.state !== 'illustrative' &&
    (typeof price.source !== 'string' || !price.source.trim())
  ) {
    throw new Error('Numeric public pricing requires accepted source provenance');
  }
  if (price.currency !== 'AED') throw new Error('Numeric public pricing must use AED');
  if (!Number.isInteger(price.minorUnits)) {
    throw new Error('Numeric public pricing must use integer minor units');
  }

  const formatted = aed.format(price.minorUnits / 100).replace(/\u00a0/gu, ' ');
  return price.state === 'illustrative' ? `${price.label}: ${formatted}` : formatted;
}
