import { PUBLIC_PRICING_CONTRACT } from '@/lib/pricing/public-pricing';

export type PublicProSource =
  | Readonly<{ state: 'approved-static'; source: string }>
  | Readonly<{ state: 'illustrative'; label: 'Illustrative product preview' }>
  | Readonly<{ state: 'unavailable'; reason: string }>;

export type ApprovedPublicProFact = {
  text: string;
  source: Extract<PublicProSource, { state: 'approved-static' }>;
};

export type UnavailablePublicProFact = {
  text: string;
  source: Extract<PublicProSource, { state: 'unavailable' }>;
};

export type IllustrativePublicProFact = {
  text: string;
  source: Extract<PublicProSource, { state: 'illustrative' }>;
};

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type PublicProAudienceId =
  | 'verified-operations'
  | 'one-company-assignment'
  | 'bounded-access';

export type PublicProCapabilityId =
  | 'company-foundations'
  | 'workforce-portals'
  | 'records-audit'
  | 'renewals'
  | 'invoices-payments';

export type PublicProProcessId =
  | 'request-verify'
  | 'company-assignment'
  | 'company-setup'
  | 'operate-workspace'
  | 'configured-communication'
  | 'authorization-audit';

export type PublicProPreviewTileId =
  | 'company-readiness'
  | 'renewal-context'
  | 'document-context'
  | 'assigned-company'
  | 'activity-context'
  | 'invoice-context';

export type PublicProFaqId =
  | 'eligibility'
  | 'assignment'
  | 'company-limit'
  | 'migration-import'
  | 'white-label'
  | 'channels-providers'
  | 'subscription-access'
  | 'support'
  | 'next-steps';

type PublicProContent = DeepReadonly<{
  hero: {
    breadcrumb: ApprovedPublicProFact;
    eyebrow: ApprovedPublicProFact;
    title: ApprovedPublicProFact;
    accent: ApprovedPublicProFact;
    description: ApprovedPublicProFact;
    links: readonly [
      { label: ApprovedPublicProFact; href: '/pricing' },
      { label: ApprovedPublicProFact; href: '/contact' },
    ];
  };
  policy: {
    label: ApprovedPublicProFact;
    items: readonly { term: ApprovedPublicProFact; detail: ApprovedPublicProFact }[];
  };
  audience: {
    eyebrow: ApprovedPublicProFact;
    title: ApprovedPublicProFact;
    description: ApprovedPublicProFact;
    items: readonly {
      id: PublicProAudienceId;
      title: ApprovedPublicProFact;
      description: ApprovedPublicProFact;
    }[];
  };
  capabilities: {
    eyebrow: ApprovedPublicProFact;
    title: ApprovedPublicProFact;
    description: ApprovedPublicProFact;
    items: readonly {
      id: PublicProCapabilityId;
      title: ApprovedPublicProFact;
      summary: ApprovedPublicProFact;
      facts: readonly ApprovedPublicProFact[];
      availability?: UnavailablePublicProFact;
    }[];
  };
  process: {
    eyebrow: ApprovedPublicProFact;
    title: ApprovedPublicProFact;
    description: ApprovedPublicProFact;
    steps: readonly {
      id: PublicProProcessId;
      title: ApprovedPublicProFact;
      description: ApprovedPublicProFact;
      availability?: UnavailablePublicProFact;
    }[];
    availabilityNote: UnavailablePublicProFact;
  };
  preview: {
    label: IllustrativePublicProFact;
    description: ApprovedPublicProFact;
    dashboard: {
      title: ApprovedPublicProFact;
      interaction: UnavailablePublicProFact;
      navigation: readonly ApprovedPublicProFact[];
      slots: readonly {
        label: ApprovedPublicProFact;
        value: ApprovedPublicProFact | IllustrativePublicProFact | UnavailablePublicProFact;
      }[];
      areas: readonly {
        label: ApprovedPublicProFact;
        state: IllustrativePublicProFact | UnavailablePublicProFact;
      }[];
    };
    bento: {
      eyebrow: ApprovedPublicProFact;
      title: ApprovedPublicProFact;
      description: ApprovedPublicProFact;
      tiles: readonly {
        id: PublicProPreviewTileId;
        eyebrow: ApprovedPublicProFact;
        title: ApprovedPublicProFact;
        preview: IllustrativePublicProFact | UnavailablePublicProFact;
        details: readonly ApprovedPublicProFact[];
      }[];
    };
  };
  benefits: {
    eyebrow: ApprovedPublicProFact;
    title: ApprovedPublicProFact;
    description: ApprovedPublicProFact;
    items: readonly {
      id: string;
      title: ApprovedPublicProFact;
      description: ApprovedPublicProFact;
    }[];
  };
  packages: {
    eyebrow: ApprovedPublicProFact;
    title: ApprovedPublicProFact;
    description: UnavailablePublicProFact;
    tiers: readonly {
      id: 'starter' | 'professional' | 'enterprise';
      name: 'Starter' | 'Professional' | 'Enterprise';
      activeCompanyLimit: 1;
      companyPolicy: 'At most one active Company per PRO';
      allocation: UnavailablePublicProFact;
    }[];
    link: { label: ApprovedPublicProFact; href: '/pricing' };
  };
  faq: {
    eyebrow: ApprovedPublicProFact;
    title: ApprovedPublicProFact;
    description: UnavailablePublicProFact;
    items: readonly {
      id: PublicProFaqId;
      question: ApprovedPublicProFact;
      answer: {
        fragments: readonly (ApprovedPublicProFact | UnavailablePublicProFact)[];
      };
    }[];
  };
  finalCta: {
    title: ApprovedPublicProFact;
    description: ApprovedPublicProFact;
    links: readonly [
      { label: ApprovedPublicProFact; href: '/pricing' },
      { label: ApprovedPublicProFact; href: '/contact' },
    ];
  };
}>;

const approvedStatic = (): Extract<PublicProSource, { state: 'approved-static' }> => ({
  state: 'approved-static',
  source: 'P1.06 frozen claim register and one-PRO/one-Company product policy',
});

const approvedFact = (text: string): ApprovedPublicProFact => ({
  text,
  source: approvedStatic(),
});

const unavailableFact = (text: string, reason: string): UnavailablePublicProFact => ({
  text,
  source: { state: 'unavailable', reason },
});

const illustrativeFact = (text: string): IllustrativePublicProFact => ({
  text,
  source: { state: 'illustrative', label: 'Illustrative product preview' },
});

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value) as DeepReadonly<T>;
}

export const PUBLIC_PRO_CONTENT: PublicProContent = deepFreeze({
  hero: {
    breadcrumb: approvedFact('For PROs'),
    eyebrow: approvedFact('.AE · For verified PRO operations'),
    title: approvedFact('Operate at most one active assigned'),
    accent: approvedFact('Company.'),
    description: approvedFact(
      'Mandoob provides a focused workspace for verified UAE PRO operations and Company administration. Account verification and one active Company assignment are required before access.',
    ),
    links: [
      { label: approvedFact('Explore plans'), href: '/pricing' },
      { label: approvedFact('Discuss access'), href: '/contact' },
    ],
  },
  policy: {
    label: approvedFact('Mandoob PRO access and assignment policy'),
    items: [
      {
        term: approvedFact('Company scope'),
        detail: approvedFact('At most one active assignment'),
      },
      {
        term: approvedFact('Account verification'),
        detail: approvedFact('Required before access'),
      },
      {
        term: approvedFact('Company assignment'),
        detail: approvedFact('Required for operations'),
      },
      {
        term: approvedFact('Company workspace'),
        detail: approvedFact('Focused operating context'),
      },
    ],
  },
  audience: {
    eyebrow: approvedFact('01 · Platform fit'),
    title: approvedFact('A focused workspace for verified UAE PRO operations.'),
    description: approvedFact(
      'The platform supports PROs responsible for administering one assigned Company. Verification and assignment are required access conditions, not statements of government approval.',
    ),
    items: [
      {
        id: 'verified-operations',
        title: approvedFact('Verified operational access'),
        description: approvedFact(
          'Account details are reviewed before workspace access. Verification is an access review, not regulated certification.',
        ),
      },
      {
        id: 'one-company-assignment',
        title: approvedFact('One assigned Company'),
        description: approvedFact(
          'Each PRO operates at most one active assigned Company under Mandoob platform policy; assignment is not automatic.',
        ),
      },
      {
        id: 'bounded-access',
        title: approvedFact('Company administration, not a marketplace'),
        description: approvedFact(
          'This is not an open marketplace or a portfolio for accepting multiple Companies. Access begins only after the required assignment.',
        ),
      },
    ],
  },
  capabilities: {
    eyebrow: approvedFact('02 · Operational suite'),
    title: approvedFact('Company work organized by capability.'),
    description: approvedFact(
      'These areas describe supported workspace context. They do not promise authority decisions, regulated advice, or provider delivery.',
    ),
    items: [
      {
        id: 'company-foundations',
        title: approvedFact('Company foundations'),
        summary: approvedFact('Legal Company profile and configured identity.'),
        facts: [
          approvedFact(
            'Organize legal and operational Company details and review setup readiness without implying certification or approval.',
          ),
          approvedFact(
            'Branding and contact configuration provide Company-facing identity and channel context.',
          ),
        ],
        availability: unavailableFact(
          'Branding provisioning and contact-channel provider availability require confirmation.',
          'No accepted production source confirms provisioning or provider delivery.',
        ),
      },
      {
        id: 'workforce-portals',
        title: approvedFact('Workforce and portal context'),
        summary: approvedFact('Employee, visa, Emirates ID and supported portal context.'),
        facts: [
          approvedFact(
            'Track employee records and relevant visa and Emirates ID workflow context for the assigned Company.',
          ),
          approvedFact(
            'Coordinate supported customer and employee portal views when access is configured.',
          ),
        ],
        availability: unavailableFact(
          'Portal access and delivery depend on confirmed workspace configuration.',
          'No public production source confirms portal provisioning for every plan.',
        ),
      },
      {
        id: 'records-audit',
        title: approvedFact('Documents and audit visibility'),
        summary: approvedFact('Company records with visible review and activity context.'),
        facts: [
          approvedFact('Keep Company documents, requests and review context together.'),
          approvedFact(
            'Review attributed activity and workflow context without presenting technical security proof.',
          ),
        ],
        availability: unavailableFact(
          'Storage allocation and detailed audit availability require plan confirmation.',
          'Exact storage and audit allocations are not approved for public publication.',
        ),
      },
      {
        id: 'renewals',
        title: approvedFact('Renewals'),
        summary: approvedFact('Renewal records and deadline visibility.'),
        facts: [
          approvedFact('Maintain renewal records and deadline workflow context for the Company.'),
        ],
        availability: unavailableFact(
          'Reminder cadence and delivery require confirmed configuration and channel availability.',
          'No accepted production source confirms cadence or delivery channels.',
        ),
      },
      {
        id: 'invoices-payments',
        title: approvedFact('Invoices and payments'),
        summary: approvedFact('Invoice and payment workflow context.'),
        facts: [
          approvedFact('Organize invoice and payment workflow context for the assigned Company.'),
        ],
        availability: unavailableFact(
          'Checkout, provider and transaction availability require confirmation.',
          'Billing-provider and checkout production availability are not approved public facts.',
        ),
      },
    ],
  },
  process: {
    eyebrow: approvedFact('03 · Operating model'),
    title: approvedFact('From access review to authorized operation.'),
    description: approvedFact(
      'The sequence separates access, assignment and workspace operation so each condition remains clear.',
    ),
    steps: [
      {
        id: 'request-verify',
        title: approvedFact('Request and verify access'),
        description: approvedFact(
          'Discuss access through the current contact route, then complete the required account review.',
        ),
      },
      {
        id: 'company-assignment',
        title: approvedFact('Receive one active Company assignment'),
        description: approvedFact(
          'An eligible PRO receives at most one active Company assignment under Mandoob platform policy.',
        ),
      },
      {
        id: 'company-setup',
        title: approvedFact('Complete and review Company setup'),
        description: approvedFact(
          'Organize the legal Company profile and review available readiness information before operation.',
        ),
      },
      {
        id: 'operate-workspace',
        title: approvedFact('Operate the Company workspace'),
        description: approvedFact(
          'Work with registrations, documents, employees, renewals, invoices and related Company records.',
        ),
      },
      {
        id: 'configured-communication',
        title: approvedFact('Use configured communication channels'),
        description: approvedFact(
          'Use Company communication workflow context after the relevant workspace configuration.',
        ),
        availability: unavailableFact(
          'Communicate through configured channels when available for the workspace and selected provider.',
          'No accepted production source confirms channel or provider delivery.',
        ),
      },
      {
        id: 'authorization-audit',
        title: approvedFact('Maintain authorized status and audit context'),
        description: approvedFact(
          'Keep access conditions current and retain visible activity context for authorized Company work.',
        ),
      },
    ],
    availabilityNote: unavailableFact(
      'Configured-channel delivery and connected workflow steps depend on provider and API availability; this page does not present every integration as available.',
      'Connected provider and API production availability is not approved for public publication.',
    ),
  },
  preview: {
    label: illustrativeFact('Illustrative product preview'),
    description: approvedFact(
      'A noninteractive workspace illustration showing the information hierarchy for at most one active assigned Company. It contains no production records.',
    ),
    dashboard: {
      title: approvedFact('One-Company workspace context'),
      interaction: unavailableFact(
        'Preview controls and navigation are unavailable.',
        'The public preview is intentionally noninteractive and is not an authenticated workspace.',
      ),
      navigation: [
        approvedFact('Company'),
        approvedFact('Readiness'),
        approvedFact('Documents'),
        approvedFact('Renewals'),
        approvedFact('Invoices'),
      ],
      slots: [
        {
          label: approvedFact('Company scope'),
          value: approvedFact('At most one active assigned Company'),
        },
        {
          label: approvedFact('Assignment'),
          value: illustrativeFact('Required access context'),
        },
        {
          label: approvedFact('Setup readiness'),
          value: illustrativeFact('Review context'),
        },
        {
          label: approvedFact('Connected data'),
          value: unavailableFact(
            'Unavailable in this preview',
            'No production Company data is used in the public preview.',
          ),
        },
      ],
      areas: [
        {
          label: approvedFact('Legal Company profile'),
          state: illustrativeFact('Illustrative workspace area'),
        },
        {
          label: approvedFact('Document and renewal context'),
          state: illustrativeFact('Illustrative workspace area'),
        },
        {
          label: approvedFact('Invoice and payment context'),
          state: unavailableFact(
            'Provider and transaction data unavailable',
            'Public provider and transaction availability is not approved.',
          ),
        },
      ],
    },
    bento: {
      eyebrow: approvedFact('05 · Capability preview'),
      title: approvedFact('One Company, six organized workspace areas.'),
      description: approvedFact(
        'These generalized surfaces illustrate capability context without production records or enabled actions.',
      ),
      tiles: [
        {
          id: 'company-readiness',
          eyebrow: approvedFact('Legal Company readiness'),
          title: approvedFact('Review profile and setup context.'),
          preview: illustrativeFact('Illustrative readiness stages'),
          details: [
            approvedFact('Company profile'),
            approvedFact('Setup context'),
            approvedFact('Review state'),
          ],
        },
        {
          id: 'renewal-context',
          eyebrow: approvedFact('Renewal context'),
          title: approvedFact('Keep deadline context visible.'),
          preview: illustrativeFact('Illustrative renewal states'),
          details: [approvedFact('Review required'), approvedFact('Upcoming context')],
        },
        {
          id: 'document-context',
          eyebrow: approvedFact('Document context'),
          title: approvedFact('Organize request and review states.'),
          preview: illustrativeFact('Illustrative document states'),
          details: [
            approvedFact('Requested'),
            approvedFact('In review'),
            approvedFact('Available'),
          ],
        },
        {
          id: 'assigned-company',
          eyebrow: approvedFact('Assigned Company'),
          title: approvedFact('At most one active Company workspace.'),
          preview: illustrativeFact('Illustrative assignment context'),
          details: [approvedFact('Assignment required'), approvedFact('Platform policy')],
        },
        {
          id: 'activity-context',
          eyebrow: approvedFact('Activity context'),
          title: approvedFact('Review attributed workflow context.'),
          preview: unavailableFact(
            'Activity records unavailable in this preview',
            'The public preview contains no production events or actors.',
          ),
          details: [approvedFact('Visible attribution'), approvedFact('Workflow context')],
        },
        {
          id: 'invoice-context',
          eyebrow: approvedFact('Invoice and payment context'),
          title: approvedFact('Organize billing workflow context.'),
          preview: unavailableFact(
            'Provider and transaction details unavailable',
            'Provider, checkout, and transaction availability is not approved for publication.',
          ),
          details: [approvedFact('Invoice context'), approvedFact('Payment context')],
        },
      ],
    },
  },
  benefits: {
    eyebrow: approvedFact('06 · Workspace capabilities'),
    title: approvedFact('Context for organized Company operations.'),
    description: approvedFact(
      'These are workspace capabilities, not promises of approvals, savings, compliance, or operational outcomes.',
    ),
    items: [
      {
        id: 'centralized-records',
        title: approvedFact('Centralized records'),
        description: approvedFact(
          'Keep supported Company records and review context within one assigned workspace.',
        ),
      },
      {
        id: 'visible-deadlines',
        title: approvedFact('Visible deadlines'),
        description: approvedFact(
          'Present renewal and deadline context where the relevant records are configured.',
        ),
      },
      {
        id: 'controlled-access',
        title: approvedFact('Controlled access'),
        description: approvedFact(
          'Apply verification, assignment, and workspace access conditions to Company operations.',
        ),
      },
      {
        id: 'workflow-context',
        title: approvedFact('Workflow context'),
        description: approvedFact(
          'Connect available Company, document, renewal, invoice, and activity context.',
        ),
      },
    ],
  },
  packages: {
    eyebrow: approvedFact('Plan connection'),
    title: approvedFact('The same one-Company policy across every tier.'),
    description: unavailableFact(
      'Exact capability allocation, allowances, support terms, and current availability require confirmation.',
      'Tier allocation, allowances, support terms, and current availability are not approved for publication.',
    ),
    tiers: PUBLIC_PRICING_CONTRACT.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      activeCompanyLimit: tier.activeCompanyLimit,
      companyPolicy: tier.companyPolicy,
      allocation: unavailableFact(
        'Allocation and allowances: contact Mandoob',
        'Exact tier allocation and allowances are not approved for publication.',
      ),
    })),
    link: { label: approvedFact('Compare plans'), href: '/pricing' },
  },
  faq: {
    eyebrow: approvedFact('PRO questions'),
    title: approvedFact('Access and workspace boundaries.'),
    description: unavailableFact(
      'Current commercial, provider, migration, and support details require confirmation before access.',
      'Current commercial, provider, migration, and support terms are not approved for publication.',
    ),
    items: [
      {
        id: 'eligibility',
        question: approvedFact('Who is eligible for PRO access?'),
        answer: {
          fragments: [
            approvedFact(
              'The workspace is intended for verified UAE PRO operations responsible for administering one assigned Company.',
            ),
            unavailableFact(
              'Eligibility is determined through account review and is not automatic acceptance or regulated certification.',
              'A public eligibility decision cannot be made before account review.',
            ),
          ],
        },
      },
      {
        id: 'assignment',
        question: approvedFact('How does Company assignment work?'),
        answer: {
          fragments: [
            approvedFact(
              'Workspace access begins after verification and an active Company assignment under Mandoob platform policy.',
            ),
          ],
        },
      },
      {
        id: 'company-limit',
        question: approvedFact('Can a PRO operate more than one Company?'),
        answer: {
          fragments: [
            approvedFact(
              'No. Each PRO operates at most one active assigned Company across Starter, Professional, and Enterprise.',
            ),
          ],
        },
      },
      {
        id: 'migration-import',
        question: approvedFact('Can existing records be migrated or imported?'),
        answer: {
          fragments: [
            approvedFact(
              'Migration and import needs can be reviewed as part of workspace planning.',
            ),
            unavailableFact(
              'Supported formats, scope, timing, and current import availability require confirmation.',
              'No approved public migration or import specification exists.',
            ),
          ],
        },
      },
      {
        id: 'white-label',
        question: approvedFact('What white-label configuration is supported?'),
        answer: {
          fragments: [
            approvedFact(
              'Branding, subdomain, and contact configuration are supported capability areas.',
            ),
            unavailableFact(
              'Provisioning, allocation, and current configuration availability require confirmation.',
              'White-label provisioning and tier allocation are not approved for publication.',
            ),
          ],
        },
      },
      {
        id: 'channels-providers',
        question: approvedFact('Which communication channels and providers are available?'),
        answer: {
          fragments: [
            approvedFact(
              'The workspace can provide configured-channel workflow context when available.',
            ),
            unavailableFact(
              'Channel delivery, provider selection, and connected API availability require confirmation.',
              'No public production source confirms channel, provider, or API delivery.',
            ),
          ],
        },
      },
      {
        id: 'subscription-access',
        question: approvedFact('How does subscription access begin?'),
        answer: {
          fragments: [
            approvedFact(
              'Plan fit, verification, one-Company assignment, and workspace configuration precede access.',
            ),
            unavailableFact(
              'Self-service registration and checkout are unavailable in this phase.',
              'Registration remains P1.10-owned and checkout remains Phase 3-owned.',
            ),
          ],
        },
      },
      {
        id: 'support',
        question: approvedFact('What support is included?'),
        answer: {
          fragments: [
            approvedFact('Support is a plan differentiation category.'),
            unavailableFact(
              'Support allocation, channels, hours, and service terms require confirmation.',
              'No approved public support allocation or service commitment exists.',
            ),
          ],
        },
      },
      {
        id: 'next-steps',
        question: approvedFact('What are the next steps?'),
        answer: {
          fragments: [
            approvedFact(
              'Explore the published plan concepts, then use the contact route to discuss access and current terms.',
            ),
          ],
        },
      },
    ],
  },
  finalCta: {
    title: approvedFact('Explore the plan that fits one assigned Company.'),
    description: approvedFact(
      'Compare plan concepts or use the current contact route to discuss verification and access.',
    ),
    links: [
      { label: approvedFact('Explore plans'), href: '/pricing' },
      { label: approvedFact('Discuss access'), href: '/contact' },
    ],
  },
});
