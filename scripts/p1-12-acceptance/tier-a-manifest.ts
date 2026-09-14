export type TierARoute = {
  id: string;
  path: string;
  canonical: string | null;
  expectedStatus: 200 | 404;
  noindex: boolean;
  jsonLdCount: number;
  jsonLdTypes: readonly string[];
  requiresMainHeading: boolean;
  kind: 'html' | 'generated';
  profile: P112EvidenceProfile;
  expectedTitle: string;
  expectedDescription: string;
  og: 'required' | 'prohibited';
  sections: readonly string[];
  themeSurfaceExemptions: readonly string[];
  enabledDestinations: readonly string[];
};

export type P112EvidenceProfile =
  | 'production'
  | 'authority-source-unavailable'
  | 'blog-empty'
  | 'blog-unavailable'
  | 'blog-detail-unavailable'
  | 'legal-unavailable'
  | 'estimator-unavailable'
  | 'route-error'
  | 'route-retry';

const ROOT_TITLE = 'Mandoob | UAE Company Setup and PRO Support';
const ROOT_DESCRIPTION = 'Explore UAE Company setup paths and prepare for ongoing PRO support.';
const COPY: Readonly<Record<string, readonly [string, string]>> = {
  home: [
    'UAE Company Setup and PRO Support | Mandoob',
    'Compare UAE Company setup paths, prepare an indicative estimate, and explore ongoing PRO support with Mandoob.',
  ],
  mainland: [
    'UAE Mainland Company Setup Guide | Mandoob',
    'Compare UAE Mainland setup paths, activities, documents, and indicative cost factors.',
  ],
  'free-zones': [
    'UAE Free Zone Company Setup Guide | Mandoob',
    'Explore UAE Free Zones with a deterministic comparison directory and indicative planning guidance.',
  ],
  offshore: [
    'UAE Offshore Company Setup Guide | Mandoob',
    'Compare available UAE Offshore setup records, requirements, and indicative planning factors.',
  ],
  'authority-ready': [
    'DMCC Company Setup Cost Guide | Mandoob',
    'DMCC setup guidance with indicative cost components, timeline assumptions, required documents, and estimator handoff.',
  ],
  'authority-missing': [ROOT_TITLE, ROOT_DESCRIPTION],
  about: [
    'About Mandoob',
    'Learn how Mandoob supports UAE company setup and business administration.',
  ],
  contact: [
    'Contact Mandoob',
    'Find the current ways to continue your UAE company setup journey with Mandoob.',
  ],
  pricing: [
    'Mandoob Pricing',
    'Compare Mandoob workspace plan concepts for a PRO operating one assigned Company.',
  ],
  pro: [
    'Mandoob for PROs',
    'Explore a focused Mandoob workspace for a verified PRO operating one assigned Company.',
  ],
  'blog-index': [
    'UAE Business Blog',
    'Published guidance for UAE Company setup, licensing, renewals, compliance, and PRO operations.',
  ],
  'blog-ready': [
    'P1.12 public acceptance fixture | Mandoob Blog',
    'Synthetic local content used only for public presentation acceptance.',
  ],
  'blog-missing': ['Blog article unavailable', 'This published Blog article is not available.'],
  'knowledge-base-index': [
    'UAE Company Setup Knowledge Base | Mandoob',
    'Browse practical UAE company setup guidance for jurisdictions, documents, indicative timelines, visas, costs, and compliance.',
  ],
  'knowledge-base-ready': [
    'UAE company setup process | Mandoob Knowledge Base',
    'A practical overview of the steps from activity selection to license issue.',
  ],
  'knowledge-base-missing': [ROOT_TITLE, ROOT_DESCRIPTION],
  'legal-privacy': [
    'Privacy Policy',
    'How Mandoob collects, uses, stores, and protects personal data under the UAE PDPL.',
  ],
  'legal-terms': [
    'Terms & Conditions',
    'Terms governing access to and use of the Mandoob platform and related services.',
  ],
  'legal-pdpl': [
    'PDPL Statement',
    'Mandoob data processing, residency, and request handling under the UAE PDPL.',
  ],
  'legal-trust': [
    'Trust Center',
    'Mandoob security controls, compliance posture, certifications, and reporting channel.',
  ],
  'generic-cms-missing': ['Page unavailable', 'This published public page is not available.'],
  estimate: [
    'UAE Company Setup Cost Estimator | Mandoob',
    'Build an indicative UAE company setup estimate with itemized assumptions, recurring costs, timeline guidance, and document requirements.',
  ],
  apply: [
    'Company Setup Application | Mandoob',
    'Prepare your UAE company setup application in a private local preview.',
  ],
  login: ['Sign in | Mandoob', 'Sign in to your Mandoob account.'],
  'signin-alias': ['Sign in | Mandoob', 'Sign in to your Mandoob account.'],
  register: ['Create an account | Mandoob', 'Create a Mandoob Customer or company account.'],
  'register-pro': [
    'PRO registration review | Mandoob',
    'Review eligibility and the current interest path for a verified Mandoob PRO.',
  ],
  'invite-invalid': ['Accept invitation | Mandoob', 'Review and complete a Mandoob invitation.'],
  'verify-otp-missing-context': [
    'Verify email | Mandoob',
    'Enter the email verification code for your Mandoob account.',
  ],
  'forgot-password': [
    'Reset password | Mandoob',
    'Request a password-reset link for a Mandoob account.',
  ],
  'reset-password-missing-context': [
    'Choose a new password | Mandoob',
    'Choose a new password for your Mandoob account.',
  ],
  'mfa-enroll-unauthenticated': [
    'Set up two-factor authentication',
    'Start when you are ready to connect an authenticator app.',
  ],
  'mfa-challenge-missing-factor': [
    'Confirm it is you',
    'Use your authenticator or a saved recovery code to continue.',
  ],
};

const SECTION: Readonly<Record<string, readonly string[]>> = {
  home: [
    '.hero',
    '.trust-band',
    '#services',
    '#flow',
    '#estimator',
    '.home-services-section',
    '.home-why-section',
    '.home-testimonials-section',
    '#customers',
    '.cta-section',
  ],
  mainland: [
    '#setup-hero',
    '[aria-labelledby="mainland-emirates-title"]',
    '[aria-labelledby="mainland-activities-title"]',
    '#setup-faq',
    '[aria-labelledby="mainland-conversion-title"]',
  ],
  'free-zones': [
    '#setup-hero',
    '[aria-labelledby="popular-free-zones-title"]',
    '[aria-labelledby="free-zone-directory-title"]',
    '#setup-faq',
    '[aria-labelledby="free-zone-conversion-title"]',
  ],
  offshore: [
    '#setup-hero',
    '[aria-labelledby="offshore-jurisdictions-title"]',
    '[aria-labelledby="offshore-benefits-title"]',
    '#setup-faq',
    '[aria-labelledby="offshore-conversion-title"]',
  ],
  'authority-ready': [
    '[aria-labelledby="auth-h"]',
    '[aria-labelledby="auth-cost-h"]',
    '[aria-labelledby="auth-timeline-h"]',
    '[aria-labelledby="auth-docs-h"]',
  ],
  'authority-missing': ['.public-content-state'],
  about: ['.about-page__who', '.about-page__values', '.about-page__process', '.about-page__team'],
  contact: ['.contact-page__workspace', '.contact-page__support-row'],
  pricing: [
    '.pricing-hero',
    '.pricing-tiers',
    '.pricing-comparison',
    '.pricing-costs',
    '.pricing-access',
    '.pricing-faq',
    '.about-contact-conversion',
  ],
  pro: [
    '.hero--pro',
    '#pro-fit',
    '#pro-capabilities',
    '#pro-operating-process',
    '#dashboard',
    '.pro-bento',
    '#pro-benefits-packages',
    '#pro-faq',
    '.about-contact-conversion',
  ],
  'blog-index': ['.blog-hero', '.blog-index'],
  'blog-ready': ['.blog-editorial-hero', 'section[aria-label="Article body"]'],
  'blog-missing': ['main h1'],
  'knowledge-base-index': ['.kb-reference-hero', '#topics', '#guides'],
  'knowledge-base-ready': ['.kb-editorial-hero', 'section[aria-label="Article body"]'],
  'knowledge-base-missing': ['.public-content-state'],
  'legal-privacy': ['.cms-page__title-section', 'section[aria-label="Privacy Policy content"]'],
  'legal-terms': ['.cms-page__title-section', 'section[aria-label="Terms & Conditions content"]'],
  'legal-pdpl': ['.cms-page__title-section', 'section[aria-label="PDPL Statement content"]'],
  'legal-trust': ['.cms-page__title-section', 'section[aria-label="Trust Center content"]'],
  'generic-cms-missing': ['.public-content-state'],
  estimate: ['#estimator-hero', '.estimator-workspace'],
  apply: ['.application-workspace'],
  login: ['.auth-experience__stage', '.auth-experience__narrative', '.auth-support'],
  'signin-alias': ['.auth-experience__stage', '.auth-experience__narrative', '.auth-support'],
  register: ['.auth-experience__stage', '.auth-experience__narrative', '.auth-support'],
  'register-pro': ['.auth-experience__stage', '.auth-experience__narrative', '.auth-support'],
  'invite-invalid': ['.auth-experience__stage', '.auth-experience__narrative', '.auth-support'],
  'verify-otp-missing-context': [
    '.auth-experience__stage',
    '.auth-experience__narrative',
    '.auth-support',
  ],
  'forgot-password': ['.auth-experience__stage', '.auth-experience__narrative', '.auth-support'],
  'reset-password-missing-context': [
    '.auth-experience__stage',
    '.auth-experience__narrative',
    '.auth-support',
  ],
  'mfa-enroll-unauthenticated': [
    '.auth-experience__stage',
    '.auth-experience__narrative',
    '.auth-support',
  ],
  'mfa-challenge-missing-factor': [
    '.auth-experience__stage',
    '.auth-experience__narrative',
    '.auth-support',
  ],
};

export type P112StateOwnership = {
  stateId: string;
  path: string;
  execution: 'tier-a-route' | 'tier-c-browser' | 'source-regression';
  condition: string;
  proof: string;
  orchestration: string;
};

/** Frozen browser-owned state exercised by each route case. Interaction/fixture states remain Tier C. */
export const P112_TIER_A_STATE_BY_ROUTE: Readonly<Record<string, string>> = {
  home: 'S007',
  mainland: 'S008',
  'free-zones': 'S009',
  offshore: 'S013',
  'authority-ready': 'S014',
  'authority-missing': 'S016',
  about: 'S017',
  contact: 'S018',
  pricing: 'S022',
  pro: 'S023',
  'blog-index': 'S024',
  'blog-ready': 'S028',
  'blog-missing': 'S030',
  'knowledge-base-index': 'S031',
  'knowledge-base-ready': 'S035',
  'knowledge-base-missing': 'S037',
  'legal-privacy': 'S038',
  'legal-terms': 'S038',
  'legal-pdpl': 'S038',
  'legal-trust': 'S038',
  'generic-cms-missing': 'S040',
  estimate: 'S042',
  apply: 'S059',
  login: 'S078',
  'signin-alias': 'S083',
  register: 'S085',
  'register-pro': 'S091',
  'invite-invalid': 'S096',
  'verify-otp-missing-context': 'S101',
  'forgot-password': 'S108',
  'reset-password-missing-context': 'S114',
  'mfa-enroll-unauthenticated': 'S144',
  'mfa-challenge-missing-factor': 'S127',
  robots: 'S133',
  sitemap: 'S136',
};

export type P112ClientJourney = {
  id: string;
  from: string;
  to: string;
  stateId: string;
  consumedContext?: { selector: string; checked: true };
};

export const P112_TIER_A_CLIENT_JOURNEYS: readonly P112ClientJourney[] = [
  { id: 'header', from: '/', to: '/free-zones', stateId: 'S002' },
  { id: 'footer', from: '/free-zones', to: '/legal/privacy', stateId: 'S003' },
  {
    id: 'mainland-estimate-context',
    from: '/mainland',
    to: '/estimate?jurisdiction=mainland',
    stateId: 'S008',
  },
] as const;

const STATE_FAMILIES = [
  [
    1,
    '/',
    'src/components/site/public-navigation.test.ts#PublicNavLinks renderer contract',
    [
      'header',
      'menus',
      'footer',
      'client-navigation pending presentation',
      'not-found',
      'sanitized error presentation',
    ],
  ],
  [7, '/', 'src/app/(public)/page.test.ts#home public contract', ['ready']],
  [
    8,
    '/mainland',
    'src/components/site/company-setup/company-setup-pages.test.ts#mainland contract',
    ['ready'],
  ],
  [
    9,
    '/free-zones',
    'src/components/site/company-setup/company-setup-pages.test.ts#free-zone discovery contract',
    ['ready', 'zero', 'search/filter no-results', 'reset'],
  ],
  [
    13,
    '/offshore',
    'src/components/site/company-setup/company-setup-pages.test.ts#offshore contract',
    ['ready'],
  ],
  [
    14,
    '/company-setup/dmcc',
    'src/app/(public)/company-setup/[authoritySlug]/page.test.ts#authority state contract',
    ['ready', 'source unavailable', 'true missing'],
  ],
  [17, '/about', 'src/components/site/about-contact-pages.test.ts#about contract', ['ready']],
  [
    18,
    '/contact',
    'src/components/site/contact/contact-page.test.ts#contact state contract',
    ['idle', 'invalid', 'submitted locally, explicitly not delivered', 'unavailable/retry'],
  ],
  [22, '/pricing', 'src/lib/pages/public-presentation.test.ts#pricing contract', ['ready']],
  [
    23,
    '/pro',
    'src/components/site/pro/pro-operating-model.test.ts#PRO public contract',
    ['ready'],
  ],
  [
    24,
    '/blog',
    'src/app/(public)/blog/page.test.ts#Blog index states',
    ['ready', 'successful empty', 'search no-results', 'source unavailable'],
  ],
  [
    28,
    '/blog/p1-12-public-fixture',
    'src/app/(public)/blog/[slug]/page.test.ts#Blog detail states',
    ['ready', 'source unavailable', 'true missing'],
  ],
  [
    31,
    '/knowledge-base',
    'src/app/(public)/knowledge-base/page.test.ts#Knowledge Base index states',
    [
      'ready',
      'successful empty contract',
      'search/category no-results',
      'catalog unavailable boundary',
    ],
  ],
  [
    35,
    '/knowledge-base/uae-company-setup-process',
    'src/app/(public)/knowledge-base/[slug]/page.test.ts#Knowledge Base detail states',
    ['ready', 'unavailable presentation contract', 'true missing'],
  ],
  [
    38,
    '/legal/privacy',
    'src/lib/pages/public-presentation.test.ts#legal and CMS visibility states',
    ['published ready', 'source unavailable', 'true missing/unpublished'],
  ],
  [
    41,
    '/estimate',
    'src/app/(public)/estimate/page.test.ts#estimator state contract',
    [
      'loading',
      'step 1 jurisdiction',
      'step 2 authority/context',
      'step 3 activity',
      'step 4 legal structure',
      'step 5 shareholders',
      'step 6 visas, including supported zero',
      'step 7 office',
      'step 8 add-ons',
      'step 9 review',
      'validation/unsupported/no-data',
      'indicative result',
      'edit with dependency invalidation',
      'reset confirmation',
      'expired/version-mismatched draft',
      'catalog unavailable/error',
      'PDF unavailable',
    ],
  ],
  [
    58,
    '/apply',
    'src/components/questionnaire/application-form.test.ts#application state contract',
    [
      'loading',
      'stage 1 Contact',
      'stage 2 Business Details',
      'stage 3 Setup',
      'stage 4 Ownership',
      'stage 5 Review',
      'Setup substep Jurisdiction',
      'Setup substep Authority',
      'Setup substep Visa requirements',
      'Setup substep Office requirement',
      'Setup substep Additional services',
      'validation/first-error focus',
      'explicit local save',
      'resume accepted local draft',
      'final review validation and separate consents',
      'local confirmed preview, not submitted',
      'duplicate presentation',
      'rate-limited presentation',
      'sanitized error presentation',
      'production unavailable/no-write',
    ],
  ],
  [
    78,
    '/login',
    'src/components/auth/auth-form-runtime.test.ts#login states',
    [
      'idle',
      'invalid',
      'pending latch',
      'neutral provider/credentials/rate error',
      'safe same-origin redirect',
    ],
  ],
  [
    83,
    '/signin',
    'src/components/auth/auth-form-contracts.test.ts#signin alias contract',
    ['alias direct render', 'canonical /login behavior'],
  ],
  [
    85,
    '/register',
    'src/components/auth/auth-form-runtime.test.ts#registration states',
    [
      'idle',
      'field/password/consent invalid',
      'pending latch',
      'duplicate',
      'rate-limited',
      'sanitized unavailable/error',
    ],
  ],
  [
    91,
    '/register/pro',
    'src/components/auth/auth-form-contracts.test.ts#PRO registration states',
    [
      'idle',
      'invalid',
      'pending geometry',
      'local review presentation',
      'Phase 3 unavailable/no-write',
    ],
  ],
  [
    96,
    '/invite/:runtime-token',
    'src/components/auth/auth-recovery-runtime.test.ts#invitation states',
    [
      'missing/invalid token shape',
      'expired/used/revoked',
      'accepted/ready',
      'pending/failure',
      'sanitized unavailable/error',
    ],
  ],
  [
    101,
    '/verify-otp',
    'src/components/auth/auth-recovery-runtime.test.ts#OTP states',
    [
      'missing context',
      'incomplete/invalid code',
      'pending/verifying',
      'expired',
      'rate-limited/error',
      'resend/cooldown',
      'success with safe continuation',
    ],
  ],
  [
    108,
    '/forgot-password',
    'src/components/auth/auth-recovery-runtime.test.ts#forgot-password states',
    [
      'idle',
      'invalid',
      'pending',
      'anti-enumerating neutral success',
      'rate-limited',
      'sanitized error/retry',
    ],
  ],
  [
    114,
    '/reset-password',
    'src/components/auth/auth-recovery-runtime.test.ts#reset-password states',
    [
      'missing context',
      'invalid password',
      'pending',
      'expired/used context',
      'success',
      'sanitized error/retry',
    ],
  ],
  [
    120,
    '/mfa/enroll',
    'src/components/auth/auth-recovery-runtime.test.ts#MFA enrollment states',
    [
      'loading',
      'authenticated eligible source/provider unavailable before enrollment can start',
      'challenge/verifying',
      'invalid code recovery',
      'successful TOTP verification before recovery-code acknowledgement/completion',
      'sanitized error',
    ],
  ],
  [
    126,
    '/mfa/challenge',
    'src/components/auth/auth-recovery-runtime.test.ts#MFA challenge states',
    [
      'loading',
      'missing/no factor/session expired',
      'invalid code',
      'pending latch',
      'expired factor/challenge',
      'success with cookie propagation',
      'sanitized error',
    ],
  ],
  [133, '/robots.txt', 'src/app/robots.test.ts#generated robots policy', ['/robots.txt ready']],
  [
    134,
    '/evidence-editorial-page',
    'src/lib/public-content/development-evidence.test.ts#development route-error states',
    ['sanitized error', 'retry'],
  ],
  [136, '/sitemap.xml', 'src/app/sitemap.test.ts#generated sitemap policy', ['/sitemap.xml ready']],
  [
    137,
    '/estimate',
    'src/app/(public)/estimate/page.test.ts#invalid estimator draft recovery',
    ['corrupt/oversized draft rejection and safe clear'],
  ],
  [
    138,
    '/mfa/enroll',
    'scripts/p1-12-acceptance/tier-b-playwright.test.ts#MFA fixture journey contract',
    [
      'eligible ready-to-start; zero mutation on mount',
      'explicit user-started enrollment',
      'QR/manual-secret presentation; browser-verifiable but never captured',
      'recovery-codes presentation; browser-verifiable but never captured',
      'acknowledgement/complete transition',
      'already-enrolled-factor handling',
      'stale/unauthenticated authorization denial before provider enrollment mutation',
    ],
  ],
  [
    145,
    '/mfa/challenge',
    'scripts/p1-12-acceptance/tier-b-playwright.test.ts#MFA challenge journey contract',
    ['verified-factor discovery/ready', 'masked recovery mode'],
  ],
] as const;

const tierARouteStates = new Set([
  ...Object.values(P112_TIER_A_STATE_BY_ROUTE),
  ...P112_TIER_A_CLIENT_JOURNEYS.map(({ stateId }) => stateId),
  // Direct-render fixture profiles declared in P112_TIER_A_RENDERED_CASES below.
  'S015',
  'S025',
  'S026',
  'S027',
  'S029',
  'S033',
  'S039',
  'S056',
  'S134',
  'S135',
]);
const tierCBrowserStates = new Set([
  'S011',
  'S019',
  'S021',
  'S052',
  'S061',
  'S063',
  'S073',
  'S077',
  'S079',
  'S081',
  'S086',
  'S128',
  'S138',
  'S142',
]);

/** Complete frozen ownership ledger. Tier C is an executable browser owner, never a Tier B substitute. */
const tierCProofByState = new Map(
  [
    ['S011', 'free-zones-no-results'],
    ['S019', 'contact-validation'],
    ['S021', 'contact-unavailable'],
    ['S052', 'estimator-result'],
    ['S061', 'application-setup'],
    ['S063', 'application-review'],
    ['S073', 'application-confirmed'],
    ['S077', 'application-unavailable'],
    ['S079', 'login-validation'],
    ['S081', 'login-error'],
    ['S086', 'register-validation'],
    ['S128', 'mfa-challenge-invalid'],
    ['S138', 'mfa-enroll-initial'],
    ['S142', 'mfa-enroll-complete'],
  ].map(([stateId, target]) => [
    stateId,
    `tests/p1-12-acceptance/tier-c.spec.ts#${target}; scripts/p1-12-acceptance/tier-c-journeys.ts#${target}`,
  ]),
);

export const P112_FROZEN_STATE_OWNERSHIP: readonly P112StateOwnership[] = STATE_FAMILIES.flatMap(
  ([first, path, sourceProof, conditions]) =>
    conditions.map((condition, offset) => {
      const stateId = `S${String(first + offset).padStart(3, '0')}`;
      const execution = tierARouteStates.has(stateId)
        ? 'tier-a-route'
        : tierCBrowserStates.has(stateId)
          ? 'tier-c-browser'
          : 'source-regression';
      return {
        stateId,
        path,
        execution,
        condition,
        proof:
          execution === 'tier-a-route'
            ? `tests/p1-12-acceptance/tier-a.spec.ts#signed direct/client execution ${stateId}`
            : execution === 'tier-c-browser'
              ? tierCProofByState.get(stateId)!
              : `${sourceProof} — ${stateId} ${condition}`,
        orchestration: `${stateId}: ${condition}`,
      } satisfies P112StateOwnership;
    }),
);

export const P112_REQUIRED_SITEMAP_PATHS = [
  '/',
  '/estimate',
  '/pricing',
  '/pro',
  '/knowledge-base',
  '/blog',
  '/mainland',
  '/free-zones',
  '/offshore',
  '/about',
  '/contact',
  ...[
    'uae-company-setup-process',
    'mainland-free-zone-offshore-comparison',
    'uae-company-setup-documents',
    'uae-company-setup-timelines',
    'uae-investor-employee-visas',
    'uae-company-setup-costs',
    'uae-compliance-basics',
  ].map((slug) => `/knowledge-base/${slug}`),
  ...[
    'abu-dhabi-airport-free-zone',
    'adgm',
    'ajman-free-zone',
    'ajman-media-city',
    'bvi-offshore-desk',
    'creative-city-fujairah',
    'dafza',
    'difc',
    'dmcc',
    'dmcc-crypto-centre',
    'dubai-airport-city',
    'dubai-auto-zone',
    'dubai-commercity',
    'dubai-ded',
    'dubai-design-district',
    'dubai-flower-centre',
    'dubai-gold-and-commodities-exchange',
    'dubai-healthcare-city',
    'dubai-international-academic-city',
    'dubai-internet-city',
    'dubai-knowledge-park',
    'dubai-maritime-city',
    'dubai-media-city',
    'dubai-production-city',
    'dubai-science-park',
    'dubai-silicon-oasis',
    'dubai-south',
    'dubai-studio-city',
    'dubai-world-trade-centre',
    'fujairah-free-zone',
    'gold-and-diamond-park',
    'hamriyah-free-zone',
    'ifz-fujairah',
    'ifza',
    'international-humanitarian-city',
    'jafza',
    'jebel-ali-offshore',
    'kizad',
    'masdar-city-free-zone',
    'meydan-free-zone',
    'rak-icc',
    'rak-maritime-city',
    'rakez',
    'saif-zone',
    'shams',
    'spc-free-zone',
    'srtip',
    'twofour54',
    'uaq-free-trade-zone',
  ].map((slug) => `/company-setup/${slug}`),
  '/legal/privacy',
  '/legal/terms',
  '/legal/pdpl',
  '/legal/trust',
] as const;

/** Shared header/footer destinations reviewed for every HTML route. */
const PUBLIC_SHELL_DESTINATIONS = [
  '/',
  '/estimate',
  '/pro',
  '/pricing',
  '/apply',
  '/about',
  '/knowledge-base',
  '/contact',
  '/legal/privacy',
  '/legal/terms',
  '/legal/pdpl',
  '/legal/trust',
  '/login',
] as const;

const ROUTE_DESTINATIONS: Readonly<Record<string, readonly string[]>> = {
  home: ['/mainland', '/free-zones', '/offshore', '/blog'],
  mainland: [
    '/estimate?jurisdiction=mainland&emirate=dubai',
    '/estimate?jurisdiction=mainland&emirate=abu_dhabi',
    '/estimate?jurisdiction=mainland&emirate=sharjah',
    '/estimate?jurisdiction=mainland&emirate=ajman',
    '/estimate?jurisdiction=mainland&emirate=ras_al_khaimah',
    '/estimate?jurisdiction=mainland&emirate=fujairah',
    '/estimate?jurisdiction=mainland&emirate=umm_al_quwain',
  ],
  'free-zones': [
    '/mainland',
    '/estimate?jurisdiction=free_zone',
    '/company-setup/dmcc',
    '/company-setup/jafza',
    '/company-setup/ifza',
    '/company-setup/rakez',
    '/company-setup/shams',
    '/company-setup/meydan-free-zone',
  ],
  offshore: [
    '/estimate?jurisdiction=offshore',
    '/company-setup/rak-icc',
    '/company-setup/jebel-ali-offshore',
  ],
  'authority-ready': ['/estimate?jurisdiction=free_zone&authority=DMCC&emirate=dubai'],
  'authority-missing': [],
  about: [],
  contact: ['/mainland', '/free-zones', '/offshore'],
  pricing: [],
  pro: [],
  'blog-index': ['/blog', '/blog/p1-12-public-fixture'],
  'blog-ready': ['/blog'],
  'blog-missing': [],
  'knowledge-base-index': [
    ...P112_REQUIRED_SITEMAP_PATHS.filter((path) => path.startsWith('/knowledge-base/')),
    '/knowledge-base?q=Free+zones',
    '/knowledge-base?q=Documents',
    '/knowledge-base?q=Visas',
    '/knowledge-base?q=Costs',
    '/knowledge-base?category=company-setup',
    '/knowledge-base?category=jurisdictions',
    '/knowledge-base?category=documents',
    '/knowledge-base?category=timelines',
    '/knowledge-base?category=visas',
    '/knowledge-base?category=costs',
    '/knowledge-base?category=compliance',
  ],
  'knowledge-base-ready': [
    '/knowledge-base/mainland-free-zone-offshore-comparison',
    '/knowledge-base/uae-company-setup-documents',
  ],
  'knowledge-base-missing': [],
  'legal-privacy': [],
  'legal-terms': [],
  'legal-pdpl': [],
  'legal-trust': [],
  'generic-cms-missing': [],
  estimate: ['/mainland', '/free-zones', '/offshore'],
  apply: [],
  login: ['/register', '/forgot-password'],
  'signin-alias': ['/register', '/forgot-password'],
  register: ['/register', '/login'],
  'register-pro': ['/register', '/contact?topic=pro-interest'],
  'invite-invalid': ['/register', '/login'],
  'verify-otp-missing-context': ['/register'],
  'forgot-password': ['/register'],
  'reset-password-missing-context': ['/register', '/login', '/forgot-password'],
  'mfa-enroll-unauthenticated': ['/register', '/login', '/mfa/challenge'],
  'mfa-challenge-missing-factor': ['/register', '/login'],
};

function enabledDestinations(id: string, path: string): readonly string[] {
  return [...new Set([path, ...PUBLIC_SHELL_DESTINATIONS, ...(ROUTE_DESTINATIONS[id] ?? [])])];
}

const html = (
  id: string,
  path: string,
  canonical: string | null = path,
  options: Partial<Pick<TierARoute, 'expectedStatus' | 'noindex' | 'jsonLdCount'>> = {},
): TierARoute => ({
  id,
  path,
  canonical,
  expectedStatus: options.expectedStatus ?? 200,
  noindex: options.noindex ?? false,
  jsonLdCount: options.jsonLdCount ?? 0,
  jsonLdTypes:
    id === 'authority-ready'
      ? ['FAQPage']
      : id === 'blog-ready'
        ? ['Article']
        : id === 'knowledge-base-ready'
          ? ['Article', 'FAQPage']
          : [],
  requiresMainHeading: true,
  kind: 'html',
  profile: 'production',
  expectedTitle: COPY[id]?.[0] ?? ROOT_TITLE,
  expectedDescription: COPY[id]?.[1] ?? ROOT_DESCRIPTION,
  og: new Set([
    'home',
    'mainland',
    'free-zones',
    'offshore',
    'authority-ready',
    'blog-index',
    'blog-ready',
    'knowledge-base-ready',
  ]).has(id)
    ? 'required'
    : 'prohibited',
  sections: SECTION[id] ?? ['.auth-experience__stage'],
  themeSurfaceExemptions: new Set(['about', 'contact', 'pricing', 'pro']).has(id)
    ? ['.about-contact-conversion']
    : id === 'blog-index'
      ? ['.blog-hero']
      : [],
  enabledDestinations: enabledDestinations(id, path),
});

const missing = (id: string, path: string) =>
  html(id, path, null, { expectedStatus: 404, noindex: true });
const auth = (id: string, path: string, canonical = path) =>
  html(id, path, canonical, { noindex: true });

/** Production-mode Tier A route baselines; interaction/fixture aliases retain Tier C ownership. */
export const P112_TIER_A_ROUTES: readonly TierARoute[] = [
  html('home', '/'),
  html('mainland', '/mainland'),
  html('free-zones', '/free-zones'),
  html('offshore', '/offshore'),
  html('authority-ready', '/company-setup/dmcc', '/company-setup/dmcc', { jsonLdCount: 1 }),
  missing('authority-missing', '/company-setup/p1-12-missing'),
  html('about', '/about'),
  html('contact', '/contact'),
  html('pricing', '/pricing'),
  html('pro', '/pro'),
  html('blog-index', '/blog'),
  html('blog-ready', '/blog/p1-12-public-fixture', '/blog/p1-12-public-fixture', {
    jsonLdCount: 1,
    noindex: true,
  }),
  html('blog-missing', '/blog/p1-12-missing', '/blog/p1-12-missing', {
    expectedStatus: 404,
    noindex: true,
  }),
  html('knowledge-base-index', '/knowledge-base'),
  html(
    'knowledge-base-ready',
    '/knowledge-base/uae-company-setup-process',
    '/knowledge-base/uae-company-setup-process',
    { jsonLdCount: 2 },
  ),
  missing('knowledge-base-missing', '/knowledge-base/p1-12-missing'),
  html('legal-privacy', '/legal/privacy'),
  html('legal-terms', '/legal/terms'),
  html('legal-pdpl', '/legal/pdpl'),
  html('legal-trust', '/legal/trust'),
  html('generic-cms-missing', '/p1-12-missing', '/p1-12-missing', {
    expectedStatus: 404,
    noindex: true,
  }),
  html('estimate', '/estimate'),
  auth('apply', '/apply'),
  auth('login', '/login'),
  auth('signin-alias', '/signin', '/login'),
  auth('register', '/register'),
  auth('register-pro', '/register/pro'),
  auth('invite-invalid', '/invite/p1-12-invalid', '/invite'),
  auth('verify-otp-missing-context', '/verify-otp'),
  auth('forgot-password', '/forgot-password'),
  auth('reset-password-missing-context', '/reset-password'),
  auth('mfa-enroll-unauthenticated', '/mfa/enroll'),
  auth('mfa-challenge-missing-factor', '/mfa/challenge'),
  {
    id: 'robots',
    path: '/robots.txt',
    canonical: null,
    expectedStatus: 200,
    noindex: false,
    jsonLdCount: 0,
    jsonLdTypes: [],
    requiresMainHeading: false,
    kind: 'generated',
    profile: 'production',
    expectedTitle: 'robots.txt',
    expectedDescription: 'generated robots policy',
    og: 'prohibited',
    sections: [],
    themeSurfaceExemptions: [],
    enabledDestinations: [],
  },
  {
    id: 'sitemap',
    path: '/sitemap.xml',
    canonical: null,
    expectedStatus: 200,
    noindex: false,
    jsonLdCount: 0,
    jsonLdTypes: [],
    requiresMainHeading: false,
    kind: 'generated',
    profile: 'production',
    expectedTitle: 'sitemap.xml',
    expectedDescription: 'generated sitemap policy',
    og: 'prohibited',
    sections: [],
    themeSurfaceExemptions: [],
    enabledDestinations: [],
  },
] as const;

export function tierAExecutionCount(projectCount = 4): number {
  return (P112_TIER_A_RENDERED_CASES.length + P112_TIER_A_CLIENT_JOURNEYS.length) * projectCount;
}

const fixtureCase = (
  baseId: string,
  id: string,
  stateId: string,
  profile: P112EvidenceProfile,
  path: string,
  overrides: Partial<TierARoute> = {},
): TierARoute & { stateId: string } => {
  const base = P112_TIER_A_ROUTES.find((route) => route.id === baseId);
  if (!base) throw new Error(`P1.12 fixture base missing: ${baseId}`);
  return {
    ...base,
    id,
    path,
    profile,
    stateId,
    enabledDestinations: enabledDestinations(base.id, path),
    ...overrides,
  };
};

export const P112_TIER_A_RENDERED_CASES: readonly (TierARoute & { stateId: string })[] = [
  ...P112_TIER_A_ROUTES.map((route) => ({
    ...route,
    stateId: P112_TIER_A_STATE_BY_ROUTE[route.id]!,
  })),
  fixtureCase('blog-index', 'blog-empty', 'S025', 'blog-empty', '/blog'),
  fixtureCase(
    'authority-ready',
    'authority-source-unavailable',
    'S015',
    'authority-source-unavailable',
    '/company-setup/dmcc',
    {
      noindex: true,
      jsonLdCount: 0,
      jsonLdTypes: [],
      expectedTitle: 'Authority guide unavailable',
      expectedDescription: 'This authority setup guide is temporarily unavailable.',
      og: 'prohibited',
      sections: ['.public-content-state'],
    },
  ),
  fixtureCase(
    'blog-index',
    'blog-search-no-results',
    'S026',
    'production',
    '/blog?q=p1-12-no-match',
  ),
  fixtureCase('blog-index', 'blog-unavailable', 'S027', 'blog-unavailable', '/blog', {
    noindex: true,
    expectedTitle: 'Blog unavailable',
    og: 'prohibited',
  }),
  fixtureCase(
    'blog-ready',
    'blog-detail-unavailable',
    'S029',
    'blog-detail-unavailable',
    '/blog/p1-12-public-fixture',
    {
      noindex: true,
      jsonLdCount: 0,
      jsonLdTypes: [],
      expectedTitle: 'Blog article unavailable',
      expectedDescription: 'This published Blog article is not available.',
      og: 'prohibited',
      sections: ['.public-content-state'],
    },
  ),
  fixtureCase(
    'knowledge-base-index',
    'knowledge-base-no-results',
    'S033',
    'production',
    '/knowledge-base?q=p1-12-no-match',
    {
      enabledDestinations: [
        ...enabledDestinations('knowledge-base-index', '/knowledge-base?q=p1-12-no-match'),
        ...[
          'company-setup',
          'jurisdictions',
          'documents',
          'timelines',
          'visas',
          'costs',
          'compliance',
        ].map((category) => `/knowledge-base?q=p1-12-no-match&category=${category}`),
      ],
    },
  ),
  fixtureCase('legal-privacy', 'legal-unavailable', 'S039', 'legal-unavailable', '/legal/privacy', {
    noindex: true,
    expectedTitle: 'Legal page unavailable',
    expectedDescription: 'This published legal page is not available.',
    sections: ['.public-content-state'],
  }),
  fixtureCase(
    'estimate',
    'estimator-unavailable',
    'S056',
    'estimator-unavailable',
    '/estimate?__estimator_state=unavailable',
  ),
  fixtureCase(
    'generic-cms-missing',
    'route-error',
    'S134',
    'route-error',
    '/evidence-editorial-page',
    {
      expectedStatus: 200,
      canonical: '/evidence-editorial-page',
      noindex: true,
      expectedTitle: 'Editorial CMS evidence page | Mandoob',
      expectedDescription: 'Development-only evidence for the generic public CMS presentation.',
      sections: ['.public-content-state'],
    },
  ),
  fixtureCase(
    'generic-cms-missing',
    'route-retry',
    'S135',
    'route-retry',
    '/evidence-editorial-page',
    {
      expectedStatus: 200,
      canonical: '/evidence-editorial-page',
      noindex: true,
      expectedTitle: 'Editorial CMS evidence page | Mandoob',
      expectedDescription: 'Development-only evidence for the generic public CMS presentation.',
      sections: [
        '.cms-editorial-hero',
        'section[aria-label="Editorial CMS evidence page content"]',
      ],
      jsonLdCount: 1,
      jsonLdTypes: ['WebPage'],
    },
  ),
];

export const P112_UNREACHABLE_RENDERED_STATES = [] as const;

export const P112_PAGE_PATHS_BY_STATE: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const paths = new Map<string, Set<string>>();
  const addRoute = (current: Set<string>, route: TierARoute) => {
    current.add(new URL(route.path, 'http://127.0.0.1:3001').pathname);
    for (const destination of route.enabledDestinations) {
      current.add(new URL(destination, 'http://127.0.0.1:3001').pathname);
    }
  };
  paths.set('S001', new Set<string>(PUBLIC_SHELL_DESTINATIONS));
  for (const route of P112_TIER_A_RENDERED_CASES) {
    const current = paths.get(route.stateId) ?? new Set<string>();
    addRoute(current, route);
    paths.set(route.stateId, current);
  }
  for (const journey of P112_TIER_A_CLIENT_JOURNEYS) {
    const current = paths.get(journey.stateId) ?? new Set<string>();
    for (const path of [journey.from, journey.to]) {
      const pathname = new URL(path, 'http://127.0.0.1:3001').pathname;
      const route = P112_TIER_A_ROUTES.find(
        (candidate) => new URL(candidate.path, 'http://127.0.0.1:3001').pathname === pathname,
      );
      if (!route) throw new Error(`P1.12 client destination route missing: ${pathname}`);
      addRoute(current, route);
    }
    paths.set(journey.stateId, current);
  }
  return paths;
})();

/** Exact accepted page query strings, keyed by owning state and pathname. */
export const P112_PAGE_QUERIES_BY_STATE: ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
> = (() => {
  const contracts = new Map<string, Map<string, Set<string>>>();
  const add = (stateId: string, value: string) => {
    const url = new URL(value, 'http://127.0.0.1:3001');
    const byPath = contracts.get(stateId) ?? new Map<string, Set<string>>();
    const searches = byPath.get(url.pathname) ?? new Set<string>();
    searches.add(url.search);
    byPath.set(url.pathname, searches);
    contracts.set(stateId, byPath);
  };
  const addRoute = (stateId: string, route: TierARoute) => {
    add(stateId, route.path);
    for (const destination of route.enabledDestinations) add(stateId, destination);
  };
  for (const destination of PUBLIC_SHELL_DESTINATIONS) add('S001', destination);
  for (const route of P112_TIER_A_RENDERED_CASES) addRoute(route.stateId, route);
  for (const journey of P112_TIER_A_CLIENT_JOURNEYS) {
    for (const value of [journey.from, journey.to]) {
      const pathname = new URL(value, 'http://127.0.0.1:3001').pathname;
      const route = P112_TIER_A_ROUTES.find(
        (candidate) => new URL(candidate.path, 'http://127.0.0.1:3001').pathname === pathname,
      );
      if (!route) throw new Error(`P1.12 client query contract route missing: ${pathname}`);
      addRoute(journey.stateId, route);
      add(journey.stateId, value);
    }
  }
  return contracts;
})();

export const P112_EVIDENCE_PROFILE_ENV: Readonly<
  Record<P112EvidenceProfile, Readonly<Record<string, string>>>
> = {
  production: {},
  'authority-source-unavailable': { P112_AUTHORITY_EVIDENCE_STATE: 'authority-source-unavailable' },
  'blog-empty': { P107_BLOG_INDEX_EVIDENCE_STATE: 'empty' },
  'blog-unavailable': { P107_BLOG_INDEX_EVIDENCE_STATE: 'unavailable' },
  'blog-detail-unavailable': { P107_BLOG_DETAIL_EVIDENCE_STATE: 'unavailable' },
  'legal-unavailable': { P107_LEGAL_EVIDENCE_STATE: 'unavailable' },
  'estimator-unavailable': {},
  'route-error': { P107_CMS_EVIDENCE_STATE: 'fixture', P112_ROUTE_ERROR_EVIDENCE_STATE: 'error' },
  'route-retry': {
    P107_CMS_EVIDENCE_STATE: 'fixture',
    MANDOOB_P109_DEMO_OUTCOME: 'confirmed-preview',
  },
};
