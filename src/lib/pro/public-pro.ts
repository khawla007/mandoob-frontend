export type PublicProSource = Readonly<{
  state: 'approved-static';
  source: string;
}>;

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type PublicProAudienceId = 'verified-operations' | 'one-company-assignment' | 'bounded-access';

export type PublicProCapabilityId =
  | 'legal-company-profile'
  | 'employees-visa-eid'
  | 'documents-storage'
  | 'renewals'
  | 'invoices-payments'
  | 'branding-contact'
  | 'audit-visibility'
  | 'portal-context';

type PublicProProcessId =
  | 'request-verify'
  | 'company-assignment'
  | 'company-setup'
  | 'operate-workspace'
  | 'configured-communication'
  | 'authorization-audit';

type PublicProContent = DeepReadonly<{
  hero: {
    breadcrumb: 'For PROs';
    eyebrow: string;
    title: string;
    accent: 'Company.';
    description: string;
    links: readonly [
      { label: 'Explore plans'; href: '/pricing'; source: PublicProSource },
      { label: 'Discuss access'; href: '/contact'; source: PublicProSource },
    ];
  };
  policy: {
    label: string;
    items: readonly { term: string; detail: string; source: PublicProSource }[];
  };
  audience: {
    eyebrow: string;
    title: string;
    description: string;
    items: readonly {
      id: PublicProAudienceId;
      title: string;
      description: string;
      source: PublicProSource;
    }[];
  };
  capabilities: {
    eyebrow: string;
    title: string;
    description: string;
    items: readonly {
      id: PublicProCapabilityId;
      title: string;
      description: string;
      source: PublicProSource;
    }[];
  };
  process: {
    eyebrow: string;
    title: string;
    description: string;
    steps: readonly {
      id: PublicProProcessId;
      title: string;
      description: string;
      source: PublicProSource;
    }[];
    availabilityNote: string;
  };
}>;

const approvedStatic = (): PublicProSource => ({
  state: 'approved-static',
  source: 'P1.06 frozen claim register and one-PRO/one-Company product policy',
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
    breadcrumb: 'For PROs',
    eyebrow: '.AE · For verified PRO operations',
    title: 'Operate at most one active assigned',
    accent: 'Company.',
    description:
      'Mandoob provides a focused workspace for verified UAE PRO operations and Company administration. Account verification and one active Company assignment are required before access.',
    links: [
      { label: 'Explore plans', href: '/pricing', source: approvedStatic() },
      { label: 'Discuss access', href: '/contact', source: approvedStatic() },
    ],
  },
  policy: {
    label: 'Mandoob PRO access and assignment policy',
    items: [
      {
        term: 'Company scope',
        detail: 'At most one active assignment',
        source: approvedStatic(),
      },
      {
        term: 'Account verification',
        detail: 'Required before access',
        source: approvedStatic(),
      },
      {
        term: 'Company assignment',
        detail: 'Required for operations',
        source: approvedStatic(),
      },
      {
        term: 'Company workspace',
        detail: 'Focused operating context',
        source: approvedStatic(),
      },
    ],
  },
  audience: {
    eyebrow: '01 · Platform fit',
    title: 'A focused workspace for verified UAE PRO operations.',
    description:
      'The platform supports PROs responsible for administering one assigned Company. Verification and assignment are required access conditions, not statements of government approval.',
    items: [
      {
        id: 'verified-operations',
        title: 'Verified operational access',
        description:
          'Account details are reviewed before workspace access. Verification is an access review, not regulated certification.',
        source: approvedStatic(),
      },
      {
        id: 'one-company-assignment',
        title: 'One assigned Company',
        description:
          'Each PRO operates at most one active assigned Company under Mandoob platform policy; assignment is not automatic.',
        source: approvedStatic(),
      },
      {
        id: 'bounded-access',
        title: 'Company administration, not a marketplace',
        description:
          'This is not an open marketplace or a portfolio for accepting multiple Companies. Access begins only after the required assignment.',
        source: approvedStatic(),
      },
    ],
  },
  capabilities: {
    eyebrow: '02 · Operational suite',
    title: 'Company work organized by capability.',
    description:
      'These areas describe supported workspace context. They do not promise authority decisions, regulated advice, or provider delivery.',
    items: [
      {
        id: 'legal-company-profile',
        title: 'Legal Company profile',
        description:
          'Organize legal and operational Company details and review setup readiness without implying certification or approval.',
        source: approvedStatic(),
      },
      {
        id: 'employees-visa-eid',
        title: 'Employees, visa and Emirates ID',
        description:
          'Track employee records and relevant visa and Emirates ID workflow context for the assigned Company.',
        source: approvedStatic(),
      },
      {
        id: 'documents-storage',
        title: 'Documents and storage',
        description:
          'Keep Company documents, requests and review context together; available storage terms depend on the confirmed plan.',
        source: approvedStatic(),
      },
      {
        id: 'renewals',
        title: 'Renewals',
        description:
          'Maintain renewal records, deadline visibility and reminder context when the relevant configuration is available.',
        source: approvedStatic(),
      },
      {
        id: 'invoices-payments',
        title: 'Invoices and payments',
        description:
          'Organize invoice and payment workflow context; checkout, provider and transaction availability require confirmation.',
        source: approvedStatic(),
      },
      {
        id: 'branding-contact',
        title: 'Branding and contact configuration',
        description:
          'Configure Company-facing identity and contact-channel context where the selected plan and providers support it.',
        source: approvedStatic(),
      },
      {
        id: 'audit-visibility',
        title: 'Audit visibility',
        description:
          'Review attributed activity and workflow context without presenting the public page as technical security proof.',
        source: approvedStatic(),
      },
      {
        id: 'portal-context',
        title: 'Customer and employee portal context',
        description:
          'Coordinate supported customer and employee views when access and the relevant workspace capabilities are configured.',
        source: approvedStatic(),
      },
    ],
  },
  process: {
    eyebrow: '03 · Operating model',
    title: 'From access review to authorized operation.',
    description:
      'The sequence separates access, assignment and workspace operation so each condition remains clear.',
    steps: [
      {
        id: 'request-verify',
        title: 'Request and verify access',
        description:
          'Discuss access through the current contact route, then complete the required account review.',
        source: approvedStatic(),
      },
      {
        id: 'company-assignment',
        title: 'Receive one active Company assignment',
        description:
          'An eligible PRO receives at most one active Company assignment under Mandoob platform policy.',
        source: approvedStatic(),
      },
      {
        id: 'company-setup',
        title: 'Complete and review Company setup',
        description:
          'Organize the legal Company profile and review available readiness information before operation.',
        source: approvedStatic(),
      },
      {
        id: 'operate-workspace',
        title: 'Operate the Company workspace',
        description:
          'Work with registrations, documents, employees, renewals, invoices and related Company records.',
        source: approvedStatic(),
      },
      {
        id: 'configured-communication',
        title: 'Use configured communication channels',
        description:
          'Communicate through configured channels when available for the workspace and selected provider.',
        source: approvedStatic(),
      },
      {
        id: 'authorization-audit',
        title: 'Maintain authorized status and audit context',
        description:
          'Keep access conditions current and retain visible activity context for authorized Company work.',
        source: approvedStatic(),
      },
    ],
    availabilityNote:
      'Configured-channel delivery and connected workflow steps depend on provider and API availability; this page does not present every integration as available.',
  },
});
