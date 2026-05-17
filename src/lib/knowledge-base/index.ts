import type { Jurisdiction } from '@/lib/estimator';
import { seededCostDataRows } from '@/lib/estimator/seed-data';

export type KnowledgeBaseCategoryId =
  | 'company-setup'
  | 'jurisdictions'
  | 'documents'
  | 'timelines'
  | 'visas'
  | 'costs'
  | 'compliance';

export type KnowledgeBaseCategory = {
  id: KnowledgeBaseCategoryId;
  label: string;
  description: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type ArticleCtaContext = {
  label: string;
  jurisdiction?: Jurisdiction;
  authority?: string;
  emirate?: string | null;
};

export type KnowledgeBaseArticle = {
  slug: string;
  title: string;
  description: string;
  category: KnowledgeBaseCategoryId;
  updatedAt: string;
  readingTimeMinutes: number;
  keywords: string[];
  faq: FaqItem[];
  relatedSlugs: string[];
  cta: ArticleCtaContext;
  sections: Array<{
    heading: string;
    body: string;
  }>;
};

export type AuthorityPageData = {
  slug: string;
  authority: string;
  jurisdiction: Jurisdiction;
  emirate: string | null;
  title: string;
  description: string;
  keywords: string[];
  setupCostPositioning: string;
  timelineDays: {
    min: number;
    max: number;
  };
  requiredDocumentKeys: string[];
  handoffUrl: string;
  assumptions: string[];
};

export type ArticleJsonLd = {
  '@context': 'https://schema.org';
  '@type': 'Article';
  headline: string;
  description: string;
  dateModified: string;
  keywords: string[];
  url: string;
};

export type FaqPageJsonLd = {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: Array<{
    '@type': 'Question';
    name: string;
    acceptedAnswer: {
      '@type': 'Answer';
      text: string;
    };
  }>;
};

export const SITE_ORIGIN = 'https://mandoob.ae';

export const KNOWLEDGE_BASE_CATEGORIES: KnowledgeBaseCategory[] = [
  {
    id: 'company-setup',
    label: 'Company setup',
    description: 'UAE incorporation steps, entity choices, and application readiness.',
  },
  {
    id: 'jurisdictions',
    label: 'Jurisdictions',
    description: 'Mainland, free zone, and offshore setup guidance by authority.',
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Passport, NOC, lease, shareholder, and attestation requirements.',
  },
  {
    id: 'timelines',
    label: 'Timelines',
    description: 'Indicative approval, registration, immigration, and renewal timing.',
  },
  {
    id: 'visas',
    label: 'Visas',
    description: 'Investor and employee visa planning for UAE company setup.',
  },
  {
    id: 'costs',
    label: 'Costs',
    description: 'Estimate-grade setup, office, shareholder, visa, and add-on costs.',
  },
  {
    id: 'compliance',
    label: 'Compliance',
    description: 'Corporate tax, UBO, ESR, renewals, and document control basics.',
  },
];

export const knowledgeBaseArticles: KnowledgeBaseArticle[] = [
  {
    slug: 'uae-company-setup-process',
    title: 'UAE company setup process',
    description: 'A practical overview of the steps from activity selection to license issue.',
    category: 'company-setup',
    updatedAt: '2026-05-08',
    readingTimeMinutes: 6,
    keywords: ['UAE company setup', 'business registration UAE', 'trade license process'],
    faq: [
      {
        question: 'Can I estimate setup cost before choosing an authority?',
        answer: 'Yes. Start with jurisdiction and visa assumptions, then refine the estimate after selecting an authority.',
      },
      {
        question: 'Does the setup process create a lead automatically?',
        answer: 'No. Public education and estimates stay anonymous until a later application form is submitted.',
      },
    ],
    relatedSlugs: ['mainland-free-zone-offshore-comparison', 'uae-company-setup-documents'],
    cta: { label: 'Estimate setup cost' },
    sections: [
      {
        heading: 'Core steps',
        body: 'Most UAE setups begin with activity selection, jurisdiction shortlisting, name reservation, document preparation, authority filing, payment, and license issue.',
      },
      {
        heading: 'What changes by authority',
        body: 'Authority rules affect office options, approvals, visa quota, activity naming, and the final government fee schedule.',
      },
    ],
  },
  {
    slug: 'mainland-free-zone-offshore-comparison',
    title: 'Mainland, free zone, and offshore comparison',
    description: 'How UAE jurisdictions differ for ownership, office, visas, and operating model.',
    category: 'jurisdictions',
    updatedAt: '2026-05-08',
    readingTimeMinutes: 7,
    keywords: ['mainland vs free zone UAE', 'offshore company UAE', 'free zone setup'],
    faq: [
      {
        question: 'Which jurisdiction is cheapest?',
        answer: 'Cost depends on authority, activity, office, shareholder count, and visas. Low-cost free zones are not always the best operational fit.',
      },
      {
        question: 'Can offshore companies sponsor UAE visas?',
        answer: 'Offshore structures generally do not provide the same visa path as mainland or free zone operating companies.',
      },
    ],
    relatedSlugs: ['uae-company-setup-process', 'uae-company-setup-costs'],
    cta: { label: 'Compare estimate options', jurisdiction: 'free_zone' },
    sections: [
      {
        heading: 'Mainland',
        body: 'Mainland companies are often selected for UAE market trading, local contracting, and wider activity flexibility.',
      },
      {
        heading: 'Free zone and offshore',
        body: 'Free zones can simplify setup for specific activities and offices. Offshore companies are usually used for holding or international structures.',
      },
    ],
  },
  {
    slug: 'uae-company-setup-documents',
    title: 'Documents needed for UAE company setup',
    description: 'Common documents requested for shareholders, offices, visas, and add-on services.',
    category: 'documents',
    updatedAt: '2026-05-08',
    readingTimeMinutes: 5,
    keywords: ['UAE company setup documents', 'trade license documents', 'free zone documents'],
    faq: [
      {
        question: 'Are passport copies always required?',
        answer: 'Passport copies are a common baseline requirement for shareholders and visa applicants.',
      },
      {
        question: 'When are attested documents needed?',
        answer: 'Attestation is usually relevant for foreign corporate shareholders, powers of attorney, or regulated activities.',
      },
    ],
    relatedSlugs: ['uae-company-setup-process', 'uae-compliance-basics'],
    cta: { label: 'Estimate document-linked costs' },
    sections: [
      {
        heading: 'Baseline documents',
        body: 'Typical files include passport copies, photos, address details, application forms, and shareholder resolutions where applicable.',
      },
      {
        heading: 'Authority-specific requests',
        body: 'Authorities can request business plans, lease documents, no-objection letters, or approvals for regulated activities.',
      },
    ],
  },
  {
    slug: 'uae-company-setup-timelines',
    title: 'UAE company setup timelines',
    description: 'Indicative timing for license, registration, office, visa, and tax add-ons.',
    category: 'timelines',
    updatedAt: '2026-05-08',
    readingTimeMinutes: 4,
    keywords: ['UAE company setup timeline', 'trade license approval time', 'free zone timeline'],
    faq: [
      {
        question: 'Can a license be issued in one week?',
        answer: 'Some straightforward free zone setups can be fast, but document readiness and activity approvals can extend timing.',
      },
      {
        question: 'Do visas add time after license issue?',
        answer: 'Yes. Immigration, medical fitness, Emirates ID, and stamping steps usually add a separate timeline.',
      },
    ],
    relatedSlugs: ['uae-company-setup-process', 'uae-investor-employee-visas'],
    cta: { label: 'Estimate timeline and fees' },
    sections: [
      {
        heading: 'Setup timing',
        body: 'Registration and licensing can range from a few days to several weeks depending on authority, activity, and document readiness.',
      },
      {
        heading: 'Post-license timing',
        body: 'Visa, bank account, tax registration, and document attestation services should be planned after the license path is clear.',
      },
    ],
  },
  {
    slug: 'uae-investor-employee-visas',
    title: 'Investor and employee visas for UAE companies',
    description: 'How visa counts affect cost, timing, and office planning for a new UAE company.',
    category: 'visas',
    updatedAt: '2026-05-08',
    readingTimeMinutes: 5,
    keywords: ['UAE investor visa', 'employee visa UAE company', 'visa quota free zone'],
    faq: [
      {
        question: 'Does every company setup include a visa?',
        answer: 'No. Visa count is a planning choice and may depend on office type, authority rules, and immigration quota.',
      },
      {
        question: 'Can visa costs be estimated separately?',
        answer: 'Yes. The estimator separates license, registration, office, visa, and add-on assumptions where data is available.',
      },
    ],
    relatedSlugs: ['uae-company-setup-timelines', 'uae-company-setup-costs'],
    cta: { label: 'Estimate with visas' },
    sections: [
      {
        heading: 'Visa planning',
        body: 'Investor and employee visas affect both budget and timeline, especially when medical fitness and Emirates ID steps are included.',
      },
      {
        heading: 'Office link',
        body: 'Some authorities connect visa eligibility to office package, lease type, or quota rules.',
      },
    ],
  },
  {
    slug: 'uae-company-setup-costs',
    title: 'UAE company setup costs',
    description: 'Estimate-grade cost components for license, registration, office, shareholders, visas, and add-ons.',
    category: 'costs',
    updatedAt: '2026-05-08',
    readingTimeMinutes: 6,
    keywords: ['UAE company setup cost', 'free zone company cost', 'trade license cost UAE'],
    faq: [
      {
        question: 'Are public estimates final quotes?',
        answer: 'No. Public estimates are indicative and depend on current authority fees, selected activity, approvals, and documents.',
      },
      {
        question: 'Why do setup costs vary so much?',
        answer: 'Authority, office type, visa count, shareholder count, and add-on services all change the final setup cost.',
      },
    ],
    relatedSlugs: ['mainland-free-zone-offshore-comparison', 'uae-compliance-basics'],
    cta: { label: 'Calculate indicative cost' },
    sections: [
      {
        heading: 'Cost components',
        body: 'Common components include license, registration, office package, additional shareholders, visas, bank assistance, tax registration, and attestation.',
      },
      {
        heading: 'Estimate assumptions',
        body: 'Estimator values are designed for anonymous planning and should be confirmed before payment or authority submission.',
      },
    ],
  },
  {
    slug: 'uae-compliance-basics',
    title: 'UAE company compliance basics',
    description: 'Core compliance topics after setup, including renewals, tax, UBO, ESR, and document records.',
    category: 'compliance',
    updatedAt: '2026-05-08',
    readingTimeMinutes: 5,
    keywords: ['UAE company compliance', 'corporate tax UAE', 'UBO UAE', 'trade license renewal'],
    faq: [
      {
        question: 'Does setup end after license issue?',
        answer: 'No. Companies still need renewal tracking, tax registration where applicable, UBO records, and document maintenance.',
      },
      {
        question: 'Is compliance the same for every jurisdiction?',
        answer: 'No. Baseline UAE obligations apply, but authority and activity rules can add specific requirements.',
      },
    ],
    relatedSlugs: ['uae-company-setup-documents', 'uae-company-setup-costs'],
    cta: { label: 'Estimate setup and add-ons' },
    sections: [
      {
        heading: 'Post-setup obligations',
        body: 'Plan for license renewals, corporate tax registration, bookkeeping readiness, UBO records, and authority correspondence.',
      },
      {
        heading: 'Document control',
        body: 'Keeping license, establishment card, shareholder, lease, and visa documents current reduces renewal and amendment risk.',
      },
    ],
  },
];

const articleBySlug = new Map(knowledgeBaseArticles.map((article) => [article.slug, article]));

export function getArticleBySlug(slug: string): KnowledgeBaseArticle | undefined {
  return articleBySlug.get(slug);
}

export function groupArticlesByCategory(): Record<KnowledgeBaseCategoryId, KnowledgeBaseArticle[]> {
  return KNOWLEDGE_BASE_CATEGORIES.reduce(
    (groups, category) => {
      groups[category.id] = knowledgeBaseArticles.filter((article) => article.category === category.id);
      return groups;
    },
    {} as Record<KnowledgeBaseCategoryId, KnowledgeBaseArticle[]>,
  );
}

export function getArticlesByCategory(): Array<{
  category: KnowledgeBaseCategory;
  articles: KnowledgeBaseArticle[];
}> {
  const groups = groupArticlesByCategory();
  return KNOWLEDGE_BASE_CATEGORIES.map((category) => ({
    category,
    articles: groups[category.id],
  })).filter((group) => group.articles.length > 0);
}

export function getRelatedArticles(article: KnowledgeBaseArticle): KnowledgeBaseArticle[] {
  return article.relatedSlugs
    .map((slug) => getArticleBySlug(slug))
    .filter((related): related is KnowledgeBaseArticle => Boolean(related));
}

export function authoritySlugFor(authority: string): string {
  return authority
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getAuthorityPages(): AuthorityPageData[] {
  const byAuthority = new Map<string, typeof seededCostDataRows>();

  for (const row of seededCostDataRows) {
    const rows = byAuthority.get(row.authority) ?? [];
    rows.push(row);
    byAuthority.set(row.authority, rows);
  }

  return [...byAuthority.entries()]
    .map(([authority, rows]) => {
      const first = rows[0];
      if (!first) throw new Error(`No cost rows found for ${authority}`);

      const baseRows = rows.filter((row) => row.feeType === 'license' || row.feeType === 'registration');
      const minBaseCost = sum(baseRows.map((row) => row.amountMinor));
      const timelineRows = rows.filter((row) => row.feeType === 'license' || row.feeType === 'registration' || row.feeType === 'office_flexi');
      const requiredDocumentKeys = [...new Set(rows.flatMap((row) => row.requiredDocumentKeys))].sort();
      const page: Omit<AuthorityPageData, 'handoffUrl'> = {
        slug: authoritySlugFor(authority),
        authority,
        jurisdiction: first.jurisdiction,
        emirate: first.emirate,
        title: `${authority} company setup cost guide`,
        description: `${authority} setup guidance with indicative cost components, timeline assumptions, required documents, and estimator handoff.`,
        keywords: [
          `${authority} company setup`,
          `${authority} setup cost`,
          `${jurisdictionLabel(first.jurisdiction)} company setup UAE`,
        ],
        setupCostPositioning: `Indicative base setup components start from AED ${minorToMajor(minBaseCost)} before visas, shareholders, office changes, and add-ons.`,
        timelineDays: {
          min: sum(timelineRows.map((row) => row.timelineMinDays)),
          max: sum(timelineRows.map((row) => row.timelineMaxDays)),
        },
        requiredDocumentKeys,
        assumptions: [
          'Figures are estimate-grade public planning data.',
          'Authority fee schedules, activity approvals, office packages, and immigration quota can change final pricing.',
          'No lead or personal data is captured by this static authority page.',
        ],
      };

      return {
        ...page,
        handoffUrl: buildEstimateHandoffUrl(page).toString(),
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export const authoritySetupPages = getAuthorityPages();

export function getAuthorityPageBySlug(slug: string): AuthorityPageData | undefined {
  return authoritySetupPages.find((page) => page.slug === slug);
}

export function buildEstimateHandoffUrl(context: {
  jurisdiction?: Jurisdiction;
  authority?: string;
  emirate?: string | null;
}): URL {
  const url = new URL('/estimate', 'https://mandoob.local');
  if (context.jurisdiction) url.searchParams.set('jurisdiction', context.jurisdiction);
  if (context.authority) url.searchParams.set('authority', context.authority);
  if (context.emirate) url.searchParams.set('emirate', context.emirate);
  return url;
}

export function buildArticleJsonLd(article: KnowledgeBaseArticle, siteOrigin: string): ArticleJsonLd {
  const origin = siteOrigin.replace(/\/+$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    dateModified: article.updatedAt,
    keywords: article.keywords,
    url: `${origin}/knowledge-base/${article.slug}`,
  };
}

export function buildFaqPageJsonLd(faq: FaqItem[]): FaqPageJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function buildFaqJsonLd(faq: FaqItem[]): FaqPageJsonLd {
  return buildFaqPageJsonLd(faq);
}

function jurisdictionLabel(jurisdiction: Jurisdiction): string {
  if (jurisdiction === 'free_zone') return 'free zone';
  return jurisdiction;
}

function minorToMajor(amountMinor: number): string {
  return (amountMinor / 100).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
