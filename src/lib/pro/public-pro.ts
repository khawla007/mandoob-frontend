export type PublicProSource =
  | Readonly<{ state: 'approved-static'; source: string }>
  | Readonly<{ state: 'unavailable'; reason: string }>;

export type ApprovedPublicProFact = {
  text: string;
  source: Extract<PublicProSource, { state: 'approved-static' }>;
};

export type UnavailablePublicProFact = {
  text: string;
  source: Extract<PublicProSource, { state: 'unavailable' }>;
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
});
