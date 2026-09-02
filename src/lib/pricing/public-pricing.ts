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
  intendedFit: string;
  caveat: string;
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

export const PUBLIC_PRICING_COMPARISON_STATUSES = [
  'Included',
  'Configurable',
  'Usage-based',
  'Unavailable',
  'Contact',
] as const;

export type PublicPricingComparisonStatus = (typeof PUBLIC_PRICING_COMPARISON_STATUSES)[number];

type PublicPricingApprovedComparisonStatus = Exclude<PublicPricingComparisonStatus, 'Contact'>;

export type PublicPricingComparisonAllocation =
  | {
      status: PublicPricingApprovedComparisonStatus;
      source: Extract<PublicPricingSource, { state: 'approved-static' }>;
    }
  | {
      status: 'Contact';
      source: Extract<PublicPricingSource, { state: 'unavailable' }>;
    };

type PublicPricingComparisonGroup =
  | 'Company workspace'
  | 'Documents and storage'
  | 'Renewals'
  | 'Invoices and payments'
  | 'Communication allowances'
  | 'Reporting and audit'
  | 'Branding'
  | 'Support';

type PublicPricingComparisonRow = {
  group: PublicPricingComparisonGroup;
  detail: string;
  tiers: readonly [
    PublicPricingComparisonAllocation,
    PublicPricingComparisonAllocation,
    PublicPricingComparisonAllocation,
  ];
};

type CostBoundary = {
  source: PublicPricingSource;
  categories: readonly string[];
  price: Extract<PublicPrice, { state: 'unavailable' }>;
};

type ApprovedPublicationFact<Text extends string = string> = {
  text: Text;
  source: Extract<PublicPricingSource, { state: 'approved-static' }>;
};

type UnavailablePublicationFact<Text extends string = string> = {
  text: Text;
  source: Extract<PublicPricingSource, { state: 'unavailable' }>;
};

type PublicPricingPublicationSummary = {
  companyPolicy: ApprovedPublicationFact<'At most one active Company per PRO'>;
  billingConcepts: ApprovedPublicationFact<'Monthly and annual'>;
  currentAvailability: UnavailablePublicationFact<'Subject to confirmation'>;
  confirmationNotice: UnavailablePublicationFact;
  categoryAllocationNotice: UnavailablePublicationFact;
  separateCostsNotice: ApprovedPublicationFact<'Government and third-party costs are separate.'>;
};

export type PublicPricingContract = DeepReadonly<{
  publicationSummary: PublicPricingPublicationSummary;
  tiers: readonly PublicPricingTier[];
  differentiationCategories: readonly PublicPricingCategory[];
  addOns: readonly {
    category: 'Communication usage';
    source: PublicPricingSource;
    price: Extract<PublicPrice, { state: 'unavailable' }>;
  }[];
  comparison: {
    caption: ApprovedPublicationFact<'Compare approved capability categories across Starter, Professional, and Enterprise.'>;
    summary: UnavailablePublicationFact;
    tierIds: readonly ['starter', 'professional', 'enterprise'];
    rows: readonly PublicPricingComparisonRow[];
  };
  costBoundaries: {
    softwareAccess: {
      inPlan: true;
      source: PublicPricingSource;
      categories: readonly ['Workspace access'];
    };
    governmentAndAuthority: CostBoundary;
    thirdParty: CostBoundary;
    otherThirdParties: ApprovedPublicationFact<'Other third parties'>;
    variabilityNotice: string;
    finalEstimateNotice: string;
    estimateLink: {
      href: '/estimate';
      label: 'Indicative estimate';
      source: Extract<PublicPricingSource, { state: 'approved-static' }>;
    };
  };
}>;

function approvedStaticSource() {
  return {
    state: 'approved-static',
    source: 'P1.06 frozen claim contract',
  } as const satisfies PublicPricingSource;
}

function approvedPublicationFact<const Text extends string>(text: Text) {
  return { text, source: approvedStaticSource() } as const;
}

function unavailablePublicationFact<const Text extends string>(text: Text, reason: string) {
  return {
    text,
    source: { state: 'unavailable', reason } as const,
  } as const;
}

const PUBLICATION_SUMMARY = {
  companyPolicy: approvedPublicationFact('At most one active Company per PRO'),
  billingConcepts: approvedPublicationFact('Monthly and annual'),
  currentAvailability: unavailablePublicationFact(
    'Subject to confirmation',
    'Current monthly and annual availability is not approved for publication',
  ),
  confirmationNotice: unavailablePublicationFact(
    'Exact amounts, billing terms, category allocation, and allowances are confirmed during a plan discussion.',
    'Exact amounts, billing terms, category allocation, and allowances are not approved for publication',
  ),
  categoryAllocationNotice: unavailablePublicationFact(
    'The categories below describe supported areas only. Exact allocation and current terms are confirmed before access.',
    'Exact category allocation and current terms are not approved for publication',
  ),
  separateCostsNotice: approvedPublicationFact('Government and third-party costs are separate.'),
} as const satisfies PublicPricingPublicationSummary;

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
    display: PUBLICATION_SUMMARY.currentAvailability.text,
    reason: PUBLICATION_SUMMARY.currentAvailability.source.reason,
  } as const;
}

function approvedComparisonStatus(
  status: PublicPricingApprovedComparisonStatus,
): PublicPricingComparisonAllocation {
  return { status, source: approvedStaticSource() };
}

function unapprovedComparisonAllocation(reason: string): PublicPricingComparisonAllocation {
  return { status: 'Contact', source: { state: 'unavailable', reason } };
}

function repeatedComparisonAllocation(
  allocation: PublicPricingComparisonAllocation,
): PublicPricingComparisonRow['tiers'] {
  return [allocation, allocation, allocation];
}

const UNAPPROVED_TIER_ALLOCATION_REASON =
  'The tier allocation is not approved for public specification';

function comparisonRow(
  group: PublicPricingComparisonGroup,
  detail: string,
  allocation: PublicPricingComparisonAllocation,
): PublicPricingComparisonRow {
  return { group, detail, tiers: repeatedComparisonAllocation(allocation) };
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
  intendedFit: string,
): Identity & PublicPricingTierDetails {
  return {
    ...identity,
    source: approvedStaticSource(),
    intendedFit,
    caveat: 'Capability allocation, allowances, and current terms require plan confirmation.',
    price: priceOnRequest(),
    activeCompanyLimit: 1,
    companyPolicy: PUBLICATION_SUMMARY.companyPolicy.text,
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
  publicationSummary: PUBLICATION_SUMMARY,
  tiers: [
    createTier(
      { id: 'starter', name: 'Starter' },
      'For PROs shaping a focused Company workspace and its core operating records.',
    ),
    createTier(
      { id: 'professional', name: 'Professional' },
      'For PROs coordinating broader workflows for one active assigned Company.',
    ),
    createTier(
      { id: 'enterprise', name: 'Enterprise' },
      'For PROs who need a tailored workspace specification and support discussion.',
    ),
  ],
  differentiationCategories: [...DIFFERENTIATION_CATEGORIES],
  addOns: [
    {
      category: 'Communication usage',
      source: approvedStaticSource(),
      price: priceOnRequest(),
    },
  ],
  comparison: {
    caption: approvedPublicationFact(
      'Compare approved capability categories across Starter, Professional, and Enterprise.',
    ),
    summary: unavailablePublicationFact(
      'Category-level capabilities are shown without inventing tier allocations. Contact Mandoob to confirm the current specification.',
      UNAPPROVED_TIER_ALLOCATION_REASON,
    ),
    tierIds: ['starter', 'professional', 'enterprise'],
    rows: [
      comparisonRow(
        'Company workspace',
        'Workspace access for at most one active assigned Company per PRO.',
        approvedComparisonStatus('Included'),
      ),
      comparisonRow(
        'Documents and storage',
        'Document and storage capability; allocation requires confirmation.',
        unapprovedComparisonAllocation(UNAPPROVED_TIER_ALLOCATION_REASON),
      ),
      comparisonRow(
        'Renewals',
        'Renewal records and workflow context; allocation requires confirmation.',
        unapprovedComparisonAllocation(UNAPPROVED_TIER_ALLOCATION_REASON),
      ),
      comparisonRow(
        'Invoices and payments',
        'Invoice and payment capability; provider and allocation require confirmation.',
        unapprovedComparisonAllocation(UNAPPROVED_TIER_ALLOCATION_REASON),
      ),
      comparisonRow(
        'Communication allowances',
        'Communication usage is an add-on concept; quantities are not published.',
        approvedComparisonStatus('Usage-based'),
      ),
      comparisonRow(
        'Reporting and audit',
        'Reporting and audit visibility; allocation requires confirmation.',
        unapprovedComparisonAllocation(UNAPPROVED_TIER_ALLOCATION_REASON),
      ),
      comparisonRow(
        'Branding',
        'Branding capability; configuration and allocation require confirmation.',
        unapprovedComparisonAllocation(UNAPPROVED_TIER_ALLOCATION_REASON),
      ),
      comparisonRow(
        'Support',
        'Support is a differentiation category; terms require confirmation.',
        unapprovedComparisonAllocation(UNAPPROVED_TIER_ALLOCATION_REASON),
      ),
    ],
  },
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
    otherThirdParties: approvedPublicationFact('Other third parties'),
    variabilityNotice:
      'Government and third-party costs vary by jurisdiction, activity, office, visa, approval, provider, and current authority schedules.',
    finalEstimateNotice:
      'Final Company-setup estimates depend on selected inputs and current schedules.',
    estimateLink: {
      href: '/estimate',
      label: 'Indicative estimate',
      source: approvedStaticSource(),
    },
  },
} satisfies PublicPricingContract);

export function resolvePublicComparisonStatus(
  allocation: PublicPricingComparisonAllocation,
): PublicPricingComparisonStatus {
  if (allocation.source.state !== 'approved-static') return 'Contact';
  return PUBLIC_PRICING_COMPARISON_STATUSES.includes(allocation.status)
    ? allocation.status
    : 'Contact';
}

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
