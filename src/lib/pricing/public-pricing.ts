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

export type PublicPricingTierId = PublicPricingTierIdentity['id'];

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

type PublicPricingApprovedComparisonStatus = Exclude<
  PublicPricingComparisonStatus,
  'Contact' | 'Usage-based'
>;

export type PublicPricingComparisonGroup =
  | 'Company workspace'
  | 'Documents and storage'
  | 'Renewals'
  | 'Invoices and payments'
  | 'Communication allowances'
  | 'Reporting and audit'
  | 'Branding'
  | 'Support';

export type PublicPricingAllocationContext = {
  readonly tierId: PublicPricingTierId;
  readonly capabilityGroup: PublicPricingComparisonGroup;
};

export type PublicPricingUsageBasedAllocationEvidence = Readonly<
  PublicPricingAllocationContext & {
    id: string;
  }
>;

export function freezePublicPricingUsageBasedAllocationEvidenceRegistry<
  const Evidence extends readonly PublicPricingUsageBasedAllocationEvidence[],
>(evidence: Evidence): DeepReadonly<Evidence> {
  return deepFreeze(evidence);
}

// Category-level add-on approval is not tier evidence; this registry stays closed until reviewed.
export const ACCEPTED_USAGE_BASED_TIER_ALLOCATION_EVIDENCE =
  freezePublicPricingUsageBasedAllocationEvidenceRegistry(
    [] as readonly PublicPricingUsageBasedAllocationEvidence[],
  );

export type PublicPricingComparisonAllocation =
  | {
      status: PublicPricingApprovedComparisonStatus;
      source: Extract<PublicPricingSource, { state: 'approved-static' }>;
    }
  | {
      status: 'Usage-based';
      evidenceId: string;
      tierId: PublicPricingTierId;
      capabilityGroup: PublicPricingComparisonGroup;
      source: Extract<PublicPricingSource, { state: 'approved-static' }>;
    }
  | {
      status: 'Contact';
      source: Extract<PublicPricingSource, { state: 'unavailable' }>;
    };

type PublicPricingComparisonRow = {
  group: PublicPricingComparisonGroup;
  detail: string;
  tiers: Readonly<Record<PublicPricingTierId, PublicPricingComparisonAllocation>>;
};

type ApprovedPublicationFact<Text extends string = string> = {
  text: Text;
  source: Extract<PublicPricingSource, { state: 'approved-static' }>;
};

type UnavailablePublicationFact<Text extends string = string> = {
  text: Text;
  source: Extract<PublicPricingSource, { state: 'unavailable' }>;
};

type CostBoundary = {
  source: PublicPricingSource;
  description: ApprovedPublicationFact;
  categories: readonly string[];
  price: Extract<PublicPrice, { state: 'unavailable' }>;
};

type PublicPricingPublicationSummary = {
  companyPolicy: ApprovedPublicationFact<'At most one active Company per PRO'>;
  billingConcepts: ApprovedPublicationFact<'Monthly and annual'>;
  currentAvailability: UnavailablePublicationFact<'Subject to confirmation'>;
  confirmationNotice: UnavailablePublicationFact;
  categoryAllocationNotice: UnavailablePublicationFact;
  separateCostsNotice: ApprovedPublicationFact<'Government and third-party costs are separate.'>;
};

type PublicPricingAccessStepId =
  | 'review-fit'
  | 'discuss-verify'
  | 'verify-access'
  | 'assign-company'
  | 'configure-workspace'
  | 'operate-billing';

type PublicPricingFaqId =
  | 'subscription-includes'
  | 'pricing-confirmation'
  | 'company-limit'
  | 'billing-cadence'
  | 'external-fees'
  | 'allowances-add-ons'
  | 'plan-changes'
  | 'estimate-versus-quote'
  | 'billing-provider';

export type PublicPricingContract = DeepReadonly<{
  publicationSummary: PublicPricingPublicationSummary;
  tiers: readonly PublicPricingTier[];
  differentiationCategories: readonly PublicPricingCategory[];
  addOns: readonly {
    category: 'Communication usage';
    basis: ApprovedPublicationFact<'Usage-based'>;
    source: PublicPricingSource;
    price: Extract<PublicPrice, { state: 'unavailable' }>;
  }[];
  comparison: {
    caption: ApprovedPublicationFact<'Compare approved capability categories across Starter, Professional, and Enterprise.'>;
    summary: UnavailablePublicationFact;
    rows: readonly PublicPricingComparisonRow[];
  };
  costBoundaries: {
    softwareAccess: {
      inPlan: true;
      source: PublicPricingSource;
      description: ApprovedPublicationFact;
      categories: readonly ['Workspace access'];
    };
    governmentAndAuthority: CostBoundary;
    thirdParty: CostBoundary;
    otherThirdParties: ApprovedPublicationFact<'Other third parties'>;
    variabilityNotice: ApprovedPublicationFact<'Government and third-party costs vary by jurisdiction, activity, office, visa, approval, provider, and current authority schedules.'>;
    finalEstimateNotice: ApprovedPublicationFact<'Final Company-setup estimates depend on selected inputs and current schedules.'>;
    estimateLink: {
      href: '/estimate';
      label: 'Indicative estimate';
      source: Extract<PublicPricingSource, { state: 'approved-static' }>;
    };
  };
  accessProcess: {
    intro: ApprovedPublicationFact;
    steps: readonly {
      id: PublicPricingAccessStepId;
      title: string;
      description: string;
      source: Extract<PublicPricingSource, { state: 'approved-static' }>;
    }[];
    registration: UnavailablePublicationFact;
    checkout: UnavailablePublicationFact;
  };
  faqIntro: UnavailablePublicationFact;
  faq: readonly {
    id: PublicPricingFaqId;
    question: string;
    answer: {
      fragments: readonly (ApprovedPublicationFact | UnavailablePublicationFact)[];
    };
  }[];
  finalCta: {
    title: ApprovedPublicationFact;
    description: ApprovedPublicationFact;
    links: readonly {
      label: 'Discuss plans' | 'Explore PRO workspace';
      href: '/contact' | '/pro';
      source: Extract<PublicPricingSource, { state: 'approved-static' }>;
    }[];
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
  return {
    starter: allocation,
    professional: allocation,
    enterprise: allocation,
  };
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
      basis: approvedPublicationFact('Usage-based'),
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
        'Allowance quantities and per-tier allocation require confirmation.',
        unapprovedComparisonAllocation(UNAPPROVED_TIER_ALLOCATION_REASON),
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
      description: approvedPublicationFact(
        'Plan access covers the Mandoob workspace boundary. Capability allocation and current terms are confirmed during a plan discussion.',
      ),
      categories: ['Workspace access'],
    },
    governmentAndAuthority: {
      source: approvedStaticSource(),
      description: approvedPublicationFact(
        'These setup costs are separate from Mandoob platform access.',
      ),
      categories: [
        'Company registration',
        'Government and authority fees',
        'Visa, medical, and Emirates ID',
      ],
      price: priceOnRequest(),
    },
    thirdParty: {
      source: approvedStaticSource(),
      description: approvedPublicationFact(
        'The categories below remain separate from platform access.',
      ),
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
    variabilityNotice: approvedPublicationFact(
      'Government and third-party costs vary by jurisdiction, activity, office, visa, approval, provider, and current authority schedules.',
    ),
    finalEstimateNotice: approvedPublicationFact(
      'Final Company-setup estimates depend on selected inputs and current schedules.',
    ),
    estimateLink: {
      href: '/estimate',
      label: 'Indicative estimate',
      source: approvedStaticSource(),
    },
  },
  accessProcess: {
    intro: approvedPublicationFact(
      'Plan access moves from fit review and confirmation into verified access, one-Company assignment, workspace configuration, and operation.',
    ),
    steps: [
      {
        id: 'review-fit',
        title: 'Review plan fit',
        description:
          'Compare the published tier concepts with the workspace capabilities you need.',
        source: approvedStaticSource(),
      },
      {
        id: 'discuss-verify',
        title: 'Discuss and verify the plan',
        description:
          'Confirm the current plan specification, billing cadence, allowances, and terms with Mandoob.',
        source: approvedStaticSource(),
      },
      {
        id: 'verify-access',
        title: 'Verify PRO and Company access',
        description: 'PRO and Company access is reviewed before a workspace can be made available.',
        source: approvedStaticSource(),
      },
      {
        id: 'assign-company',
        title: 'Receive one-Company assignment',
        description: 'An eligible PRO receives at most one active assigned Company.',
        source: approvedStaticSource(),
      },
      {
        id: 'configure-workspace',
        title: 'Configure the workspace',
        description:
          'Review Company details and configure the supported workspace capabilities that apply.',
        source: approvedStaticSource(),
      },
      {
        id: 'operate-billing',
        title: 'Operate and manage billing',
        description:
          'Use the assigned workspace and manage subscription context when the required billing capability is available.',
        source: approvedStaticSource(),
      },
    ],
    registration: unavailablePublicationFact(
      'PRO registration is unavailable in this phase and remains owned by P1.10.',
      'The P1.10 PRO registration frontend is not implemented',
    ),
    checkout: unavailablePublicationFact(
      'Checkout and billing provider access are unavailable in this phase and remain owned by Phase 3.',
      'Checkout and billing providers are Phase 3 capabilities',
    ),
  },
  faqIntro: unavailablePublicationFact(
    'These answers describe the current publication boundary. Confirm current terms before relying on a plan decision.',
    'Current plan terms are confirmed during a plan discussion',
  ),
  faq: [
    {
      id: 'subscription-includes',
      question: 'What does a Mandoob subscription include?',
      answer: {
        fragments: [
          approvedPublicationFact(
            'A subscription provides workspace access for at most one active assigned Company per PRO.',
          ),
          unavailablePublicationFact(
            'The exact capability allocation and current terms are confirmed during a plan discussion.',
            'Exact capability allocation and current terms are not approved for publication',
          ),
        ],
      },
    },
    {
      id: 'pricing-confirmation',
      question: 'Why do exact prices require confirmation?',
      answer: {
        fragments: [
          unavailablePublicationFact(
            'Exact amounts, current billing terms, allowances, and tier allocations do not have an approved public source, so Mandoob must confirm them before access.',
            'Exact public pricing and allocation are not approved for publication',
          ),
        ],
      },
    },
    {
      id: 'company-limit',
      question: 'Does every tier keep the one-Company limit?',
      answer: {
        fragments: [
          approvedPublicationFact(
            'Yes. Every tier permits at most one active assigned Company per PRO; a higher tier does not add another Company.',
          ),
        ],
      },
    },
    {
      id: 'billing-cadence',
      question: 'Are monthly and annual billing available?',
      answer: {
        fragments: [
          approvedPublicationFact('Monthly and annual are supported plan concepts.'),
          unavailablePublicationFact(
            'Current availability and terms require confirmation. No pricing advantage is published for either cadence.',
            'Current cadence availability and terms are not approved for publication',
          ),
        ],
      },
    },
    {
      id: 'external-fees',
      question: 'Are government and third-party fees included?',
      answer: {
        fragments: [
          approvedPublicationFact(
            'Government, authority, provider, and other third-party costs are separate from platform access and vary with jurisdiction, activity, office, visa, approval, provider, and current schedules.',
          ),
        ],
      },
    },
    {
      id: 'allowances-add-ons',
      question: 'How do allowances and add-ons work?',
      answer: {
        fragments: [
          approvedPublicationFact(
            'Communication allowances use an approved usage-based add-on concept.',
          ),
          unavailablePublicationFact(
            'Current quantities, tier allocation, terms, and prices require confirmation and remain unavailable for publication.',
            'Allowance quantities, allocation, and add-on terms are not approved for publication',
          ),
        ],
      },
    },
    {
      id: 'plan-changes',
      question: 'Can a plan be upgraded, downgraded, or cancelled?',
      answer: {
        fragments: [
          unavailablePublicationFact(
            'Availability and terms for upgrades, downgrades, and cancellation require confirmation before you rely on a plan-change option.',
            'Plan-change and cancellation terms are not approved for publication',
          ),
        ],
      },
    },
    {
      id: 'estimate-versus-quote',
      question: 'Is the Company-setup estimator a final quote?',
      answer: {
        fragments: [
          approvedPublicationFact(
            'No. The estimator is indicative Company-setup planning, not a published plan amount or final quote; current schedules and selected inputs still apply.',
          ),
        ],
      },
    },
    {
      id: 'billing-provider',
      question: 'Is online billing or checkout available now?',
      answer: {
        fragments: [
          unavailablePublicationFact(
            'Billing provider and checkout access are unavailable in this phase and remain owned by Phase 3. Published invoice, payment, and subscription-management concepts do not establish current provider availability.',
            'Checkout and billing providers are Phase 3 capabilities',
          ),
        ],
      },
    },
  ],
  finalCta: {
    title: approvedPublicationFact('Find the plan context that fits your Company workspace.'),
    description: approvedPublicationFact(
      'Discuss the current specification with Mandoob or explore how the PRO workspace is structured.',
    ),
    links: [
      { label: 'Discuss plans', href: '/contact', source: approvedStaticSource() },
      { label: 'Explore PRO workspace', href: '/pro', source: approvedStaticSource() },
    ],
  },
} satisfies PublicPricingContract);

type UsageBasedComparisonAllocation = Extract<
  PublicPricingComparisonAllocation,
  { status: 'Usage-based' }
>;

export function matchesUsageBasedTierAllocationEvidence(
  allocation: UsageBasedComparisonAllocation,
  context: PublicPricingAllocationContext,
  evidence: PublicPricingUsageBasedAllocationEvidence,
): boolean {
  return (
    allocation.evidenceId === evidence.id &&
    allocation.tierId === context.tierId &&
    allocation.capabilityGroup === context.capabilityGroup &&
    evidence.tierId === context.tierId &&
    evidence.capabilityGroup === context.capabilityGroup
  );
}

export function resolvePublicComparisonStatus(
  allocation: PublicPricingComparisonAllocation,
  context: PublicPricingAllocationContext,
): PublicPricingComparisonStatus {
  if (!allocation || allocation.source.state !== 'approved-static') return 'Contact';
  if (allocation.status === 'Usage-based') {
    return ACCEPTED_USAGE_BASED_TIER_ALLOCATION_EVIDENCE.some((evidence) =>
      matchesUsageBasedTierAllocationEvidence(allocation, context, evidence),
    )
      ? 'Usage-based'
      : 'Contact';
  }
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
