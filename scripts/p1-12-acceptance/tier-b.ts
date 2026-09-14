import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { assertP112NoSymlinkPath } from './tier-b-fs';

export const P112_PARITY_CRITERIA = [
  'section-count-and-order',
  'layout-bands-and-transitions',
  'hero-and-body-relationship',
  'content-density-and-whitespace-rhythm',
  'typography-hierarchy',
  'grid-table-form-workspace-proportions',
  'card-and-supporting-panel-relationships',
  'cta-placement-and-prominence',
  'image-or-illustration-role',
  'footer-handoff',
  'light-and-dark-treatment',
  'safety-prd-and-accepted-behavior-differences',
] as const;

export const P112_PARITY_REJECTIONS = [
  'missing-or-reordered-required-sections',
  'materially-reduced-density',
  'generic-card-grid-replaces-reference-hierarchy',
  'materially-redesigned-form-workspace-table-summary-or-cta',
  'weakened-homepage-hero-or-final-get-started',
  'fabricated-content-or-action-for-similarity',
  'page-local-colors-fonts-or-inconsistent-shell',
  'multi-company-or-team-language',
  'clipped-illegible-light-only-or-dark-only-content',
] as const;

export type P112ParityCriterion = (typeof P112_PARITY_CRITERIA)[number];
export type P112ReferenceId = `R${number}`;

export const P112_ACCEPTED_BASE_SHA = '6995abccd0986127f11b8e0751c54fe913584da7' as const;

export type P112RunCommitment = {
  runId: string;
  acceptedBaseSha: string;
  candidateSha: string;
  candidateDigest: string;
  candidateDescendsFromAcceptedBase: true;
  commitment: string;
};

export function createP112RunCommitment(
  input: Omit<P112RunCommitment, 'commitment'> & { signingKey: string },
): P112RunCommitment {
  const unsigned = {
    runId: input.runId,
    acceptedBaseSha: input.acceptedBaseSha,
    candidateSha: input.candidateSha,
    candidateDigest: input.candidateDigest,
    candidateDescendsFromAcceptedBase: input.candidateDescendsFromAcceptedBase,
  };
  const commitment = createHmac('sha256', Buffer.from(input.signingKey, 'hex'))
    .update(JSON.stringify(unsigned))
    .digest('hex');
  const result = Object.freeze({ ...unsigned, commitment });
  validateP112RunCommitment(result, input.signingKey);
  return result;
}

export function validateP112RunCommitment(value: P112RunCommitment, signingKey: string): void {
  if (
    !/^[a-z0-9][a-z0-9-]{7,63}$/u.test(value.runId) ||
    value.acceptedBaseSha !== P112_ACCEPTED_BASE_SHA ||
    !/^[a-f0-9]{40,64}$/u.test(value.candidateSha) ||
    !/^[a-f0-9]{64}$/u.test(value.candidateDigest) ||
    value.candidateDescendsFromAcceptedBase !== true ||
    !/^[a-f0-9]{64}$/u.test(value.commitment) ||
    !/^[a-f0-9]{64}$/u.test(signingKey)
  )
    throw new Error(
      value.acceptedBaseSha !== P112_ACCEPTED_BASE_SHA
        ? 'P1.12 run commitment accepted base mismatch'
        : 'P1.12 run commitment identity invalid',
    );
  const expected = createHmac('sha256', Buffer.from(signingKey, 'hex'))
    .update(
      JSON.stringify({
        runId: value.runId,
        acceptedBaseSha: value.acceptedBaseSha,
        candidateSha: value.candidateSha,
        candidateDigest: value.candidateDigest,
        candidateDescendsFromAcceptedBase: value.candidateDescendsFromAcceptedBase,
      }),
    )
    .digest('hex');
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(value.commitment, 'hex')))
    throw new Error('P1.12 run commitment mismatch');
}

export type P112Reference = {
  id: P112ReferenceId;
  sourcePath: string;
  width: number;
  height: number;
  sha256: string;
  primaryRoute: string;
  primaryStates: readonly string[];
  routeByState: Readonly<Record<string, string>>;
};

export const P112_REFERENCES: readonly P112Reference[] = [
  {
    id: 'R01',
    sourcePath: 'updated design mandoop/public frontend/homee.png',
    width: 829,
    height: 1897,
    sha256: '84a56dd8a18a8e38a023641bb271ee73fd14dfaff5b112e86f74bd8958c4c428',
    primaryRoute: '/',
    primaryStates: ['S007'],
    routeByState: { S007: '/' },
  },
  {
    id: 'R02',
    sourcePath: 'updated design mandoop/public frontend/Mainland.png',
    width: 869,
    height: 1810,
    sha256: '39fdcb4b39ff26c46601dc334b56c1c226221e048ab0758c7f1a59abc814e35e',
    primaryRoute: '/mainland',
    primaryStates: ['S008'],
    routeByState: { S008: '/mainland' },
  },
  {
    id: 'R03',
    sourcePath: 'updated design mandoop/public frontend/Free Zone.png',
    width: 1018,
    height: 1544,
    sha256: 'cede020212c96178998402191cf788588c05a33a9c1b0f40013a268f5d2dbb59',
    primaryRoute: '/free-zones',
    primaryStates: ['S009', 'S011'],
    routeByState: { S009: '/free-zones', S011: '/free-zones' },
  },
  {
    id: 'R04',
    sourcePath: 'updated design mandoop/public frontend/ Offshore.png',
    width: 1005,
    height: 1565,
    sha256: 'f5db4b70dd104224294141bf2c13d70dc867c2028883d02c1b0f032a99eeefe9',
    primaryRoute: '/offshore',
    primaryStates: ['S013'],
    routeByState: { S013: '/offshore' },
  },
  {
    id: 'R05',
    sourcePath: 'updated design mandoop/public frontend/About us.png',
    width: 1024,
    height: 1536,
    sha256: '1b0b2f18cf58e94e3a094a8b3552e6e3e5ca10b02e8e65a0ede54dc8fd526741',
    primaryRoute: '/about',
    primaryStates: ['S017'],
    routeByState: { S017: '/about' },
  },
  {
    id: 'R06',
    sourcePath: 'updated design mandoop/public frontend/Contact us.png',
    width: 1024,
    height: 1536,
    sha256: '70e512d656829cd017fef7d1aae364217b9c6c7e801dce223a6360b505a858a6',
    primaryRoute: '/contact',
    primaryStates: ['S018', 'S019', 'S021'],
    routeByState: { S018: '/contact', S019: '/contact', S021: '/contact' },
  },
  {
    id: 'R07',
    sourcePath: 'updated design mandoop/public frontend/knowledge base.png',
    width: 941,
    height: 1672,
    sha256: '27482bf351b5b5ef6645413475aee0a810878721366b767c571483cdf2622c0d',
    primaryRoute: '/knowledge-base',
    primaryStates: ['S031', 'S033'],
    routeByState: { S031: '/knowledge-base', S033: '/knowledge-base?q=p1-12-no-match' },
  },
  {
    id: 'R08',
    sourcePath: 'updated design mandoop/public frontend/COST ESTIMATOR.png',
    width: 864,
    height: 1821,
    sha256: 'b1a01b9ead62b446d825a5cc2dea50657225fee5516e964ed6f41ea411599e4f',
    primaryRoute: '/estimate',
    primaryStates: ['S042', 'S052', 'S056'],
    routeByState: {
      S042: '/estimate',
      S052: '/estimate',
      S056: '/estimate?__estimator_state=unavailable',
    },
  },
  {
    id: 'R09',
    sourcePath: 'updated design mandoop/public frontend/REGISTRATION.png',
    width: 1536,
    height: 1024,
    sha256: '8363651eea66d769e4de0d5c1ad9d7f745010d877408f9f2dbc4a30e31c9e15f',
    primaryRoute: '/apply',
    primaryStates: ['S061', 'S063'],
    routeByState: { S061: '/apply', S063: '/apply' },
  },
  {
    id: 'R10',
    sourcePath: 'updated design mandoop/public frontend/application-submited.png',
    width: 1536,
    height: 1024,
    sha256: 'fac43e33f585cc5058a4444a88b3df3295de50b754277b62fef57d30a8228aa3',
    primaryRoute: '/apply',
    primaryStates: ['S073'],
    routeByState: { S073: '/apply' },
  },
  {
    id: 'R11',
    sourcePath: 'updated design mandoop/public frontend/Login.png',
    width: 1196,
    height: 1315,
    sha256: 'fba7ac40a09160cac01c2282d47d7ea70aec17c1604912e7a78c66e445437e47',
    primaryRoute: '/login',
    primaryStates: ['S078', 'S083'],
    routeByState: { S078: '/login', S083: '/signin' },
  },
  {
    id: 'R12',
    sourcePath: 'updated design mandoop/public frontend/Register Account Creation.png',
    width: 1144,
    height: 1375,
    sha256: '42eab673e1b7c0128baf8120fa3eee9917c9883e8bb44b75a8cef173eaff0d86',
    primaryRoute: '/register',
    primaryStates: ['S085', 'S091'],
    routeByState: { S085: '/register', S091: '/register/pro' },
  },
] as const;

export type P112TierBTarget = {
  id: string;
  family: string;
  route: string;
  stateId: `S${number}`;
  fixtureAlias: string;
  locale: 'en';
  dsf: 1;
  owner: 'tier-b-direct' | 'tier-c-prepared';
  privacyClass: 'public' | 'secret-safe-mfa';
  comparisonMethod: 'structural-review';
  pixelSimilarityClaim: false;
  requiredPreservations: readonly string[];
  reference:
    | { kind: 'exact'; id: P112ReferenceId }
    | {
        kind: 'closest-pattern';
        ids: readonly P112ReferenceId[];
        sourceEvidence: { path: string; version: string; section: string };
      };
};

const acceptedEvidence = (description: string) => {
  const phase = description.startsWith('P1.04')
    ? [
        '2026-08-31/public-frontend-phase-1/p1-04-company-setup/parity-matrix.md',
        'P1.04@accepted-2026-08-31',
        '# P1.04 strict-parity matrix',
      ]
    : description.startsWith('P1.06')
      ? [
          '2026-09-02/public-frontend-phase-1/p1-06-pricing-pro/parity-matrix.md',
          'P1.06@accepted-2026-09-02',
          '# P1.06 parity matrix',
        ]
      : description.startsWith('P1.07')
        ? [
            '2026-09-05/public-frontend-phase-1/p1-07-knowledge-blog-legal-cms/editorial-route-state-matrix.md',
            'P1.07@accepted-2026-09-05',
            '# Editorial route and state matrix',
          ]
        : description.startsWith('P1.08')
          ? [
              '2026-09-05/public-frontend-phase-1/p1-08-cost-estimator/reference-parity-matrix.md',
              'P1.08@accepted-2026-09-05',
              '# P1.08 reference parity',
            ]
          : [
              '2026-09-07/public-frontend-phase-1/p1-10-authentication/reference-parity-matrix.md',
              'P1.10@accepted-2026-09-07',
              '# P1.10 Reference Parity Matrix',
            ];
  return {
    path: `Reports/launch-gate-evidence/${phase[0]}`,
    version: phase[1],
    section: `${phase[2]} — ${description}`,
  };
};

const exact = (
  id: string,
  family: string,
  route: string,
  stateId: `S${number}`,
  fixtureAlias: string,
  referenceId: P112ReferenceId,
  owner: P112TierBTarget['owner'] = 'tier-b-direct',
): P112TierBTarget => ({
  id,
  family,
  route,
  stateId,
  fixtureAlias,
  locale: 'en',
  dsf: 1,
  owner,
  privacyClass: 'public',
  comparisonMethod: 'structural-review',
  pixelSimilarityClaim: false,
  requiredPreservations: [],
  reference: { kind: 'exact', id: referenceId },
});

const closest = (
  id: string,
  family: string,
  route: string,
  stateId: `S${number}`,
  fixtureAlias: string,
  ids: readonly P112ReferenceId[],
  sourceEvidence: string,
  owner: P112TierBTarget['owner'] = 'tier-b-direct',
): P112TierBTarget => ({
  id,
  family,
  route,
  stateId,
  fixtureAlias,
  locale: 'en',
  dsf: 1,
  owner,
  privacyClass: 'public',
  comparisonMethod: 'structural-review',
  pixelSimilarityClaim: false,
  requiredPreservations: [],
  reference: { kind: 'closest-pattern', ids, sourceEvidence: acceptedEvidence(sourceEvidence) },
});

/**
 * Tier C owns setup for interaction-derived states; Tier B owns only their retained,
 * privacy-reviewed capture and structural decision. No state is simulated here.
 */
export const P112_TIER_B_TARGETS: readonly P112TierBTarget[] = [
  {
    ...exact('home-ready', 'home', '/', 'S007', 'home-ready', 'R01'),
    requiredPreservations: ['accepted-homepage-hero', '07-get-started'],
  },
  exact('mainland-ready', 'mainland', '/mainland', 'S008', 'mainland-ready', 'R02'),
  exact('free-zones-ready', 'free-zones', '/free-zones', 'S009', 'free-zones-ready', 'R03'),
  exact(
    'free-zones-no-results',
    'free-zones',
    '/free-zones',
    'S011',
    'free-zones-no-results',
    'R03',
    'tier-c-prepared',
  ),
  exact('offshore-ready', 'offshore', '/offshore', 'S013', 'offshore-ready', 'R04'),
  exact('about-ready', 'about', '/about', 'S017', 'about-ready', 'R05'),
  exact('contact-idle', 'contact', '/contact', 'S018', 'contact-idle', 'R06'),
  exact(
    'contact-validation',
    'contact',
    '/contact',
    'S019',
    'contact-validation',
    'R06',
    'tier-c-prepared',
  ),
  exact(
    'contact-unavailable',
    'contact',
    '/contact',
    'S021',
    'contact-unavailable',
    'R06',
    'tier-c-prepared',
  ),
  exact(
    'knowledge-base-ready',
    'knowledge-base',
    '/knowledge-base',
    'S031',
    'knowledge-base-ready',
    'R07',
  ),
  exact(
    'knowledge-base-no-results',
    'knowledge-base',
    '/knowledge-base?q=p1-12-no-match',
    'S033',
    'knowledge-base-no-results',
    'R07',
  ),
  exact('estimator-step-one', 'estimator', '/estimate', 'S042', 'estimator-demo-ready', 'R08'),
  exact(
    'estimator-result',
    'estimator',
    '/estimate',
    'S052',
    'estimator-result',
    'R08',
    'tier-c-prepared',
  ),
  exact(
    'estimator-unavailable',
    'estimator',
    '/estimate?__estimator_state=unavailable',
    'S056',
    'estimator-unavailable',
    'R08',
  ),
  exact(
    'application-setup',
    'application',
    '/apply',
    'S061',
    'application-setup',
    'R09',
    'tier-c-prepared',
  ),
  exact(
    'application-review',
    'application',
    '/apply',
    'S063',
    'application-review',
    'R09',
    'tier-c-prepared',
  ),
  exact(
    'application-confirmed',
    'application',
    '/apply',
    'S073',
    'application-confirmed-preview',
    'R10',
    'tier-c-prepared',
  ),
  closest(
    'application-unavailable',
    'application',
    '/apply',
    'S077',
    'application-production-unavailable',
    ['R10'],
    'P1.08 application unavailable and recovery contract',
    'tier-c-prepared',
  ),
  exact('login-idle', 'login', '/login', 'S078', 'auth-login-idle', 'R11'),
  exact(
    'login-validation',
    'login',
    '/login',
    'S079',
    'auth-login-invalid',
    'R11',
    'tier-c-prepared',
  ),
  exact(
    'login-error',
    'login',
    '/login',
    'S081',
    'auth-login-neutral-error',
    'R11',
    'tier-c-prepared',
  ),
  exact('signin-alias', 'signin', '/signin', 'S083', 'signin-alias', 'R11'),
  exact('register-idle', 'register', '/register', 'S085', 'auth-register-idle', 'R12'),
  exact(
    'register-validation',
    'register',
    '/register',
    'S086',
    'auth-register-invalid',
    'R12',
    'tier-c-prepared',
  ),
  exact('register-pro-idle', 'register-pro', '/register/pro', 'S091', 'pro-review-idle', 'R12'),
  closest(
    'pricing-ready',
    'pricing',
    '/pricing',
    'S022',
    'pricing-ready',
    ['R03', 'R05'],
    'P1.06 seven-region pricing composition',
  ),
  closest(
    'pro-ready',
    'pro',
    '/pro',
    'S023',
    'pro-ready',
    ['R05'],
    'P1.06 seven-region PRO composition',
  ),
  closest(
    'authority-ready',
    'authority-detail',
    '/company-setup/dmcc',
    'S014',
    'authority-dmcc-ready',
    ['R02', 'R03'],
    'P1.04/P1.07 authority detail contract',
  ),
  closest(
    'blog-index-ready',
    'blog-index',
    '/blog',
    'S024',
    'p112-blog-ready',
    ['R07'],
    'P1.07 editorial discovery contract',
  ),
  closest(
    'blog-detail-ready',
    'blog-detail',
    '/blog/p1-12-public-fixture',
    'S028',
    'p112-blog-ready',
    ['R07'],
    'P1.07 editorial detail contract',
  ),
  closest(
    'knowledge-base-detail-ready',
    'knowledge-base-detail',
    '/knowledge-base/uae-company-setup-process',
    'S035',
    'knowledge-base-static-ready',
    ['R07'],
    'P1.04 knowledge detail contract',
  ),
  closest(
    'legal-privacy-ready',
    'legal-privacy',
    '/legal/privacy',
    'S038',
    'legal-static-ready',
    ['R07'],
    'P1.07 legal detail contract',
  ),
  closest(
    'legal-terms-ready',
    'legal-terms',
    '/legal/terms',
    'S038',
    'legal-static-ready',
    ['R07'],
    'P1.07 legal detail contract',
  ),
  closest(
    'legal-pdpl-ready',
    'legal-pdpl',
    '/legal/pdpl',
    'S038',
    'legal-static-ready',
    ['R07'],
    'P1.07 legal detail contract',
  ),
  closest(
    'legal-trust-ready',
    'legal-trust',
    '/legal/trust',
    'S038',
    'legal-static-ready',
    ['R07'],
    'P1.07 legal detail contract',
  ),
  closest(
    'generic-cms-ready',
    'generic-cms',
    '/evidence-editorial-page',
    'S038',
    'p107-cms-fixture',
    ['R07'],
    'P1.07 generic CMS detail contract',
    'tier-c-prepared',
  ),
  closest(
    'blog-unavailable',
    'blog-unavailable',
    '/blog',
    'S027',
    'blog-unavailable',
    ['R07'],
    'P1.07 editorial unavailable contract',
  ),
  closest(
    'blog-missing',
    'blog-missing',
    '/blog/p1-12-missing',
    'S030',
    'blog-true-missing',
    ['R07'],
    'P1.07 editorial missing contract',
  ),
  {
    ...closest(
      'mfa-enroll-initial',
      'mfa-enroll',
      '/mfa/enroll',
      'S138',
      'mfa-eligible-ready',
      ['R11'],
      'P1.10 auth shell contract',
      'tier-c-prepared',
    ),
    privacyClass: 'secret-safe-mfa',
  },
  {
    ...closest(
      'mfa-challenge-invalid',
      'mfa-challenge',
      '/mfa/challenge',
      'S128',
      'mfa-challenge-invalid',
      ['R11'],
      'P1.10 auth shell contract',
      'tier-c-prepared',
    ),
    privacyClass: 'secret-safe-mfa',
  },
  {
    ...closest(
      'mfa-enroll-complete',
      'mfa-enroll',
      '/',
      'S142',
      'mfa-enrollment-complete-redirect-home',
      ['R11'],
      'P1.10 auth shell contract',
      'tier-c-prepared',
    ),
    privacyClass: 'secret-safe-mfa',
  },
] as const;

export const P112_NEVER_CAPTURE_STATE_IDS = ['S140', 'S141'] as const;

export type P112CapturePreparationProof = {
  targetId: string;
  stateId: string;
  fixtureAlias: string;
  route: string;
  preparedBy: P112TierBTarget['owner'];
  preparedAt: string;
  source: string;
  nonce: string;
  observations: {
    responseStatus: number;
    finalUrl: string;
    stateSelectors: readonly { selector: string; count: number; visibleCount: number }[];
    enabledControlCount: number;
    documentStatus: 'complete';
  };
  signature: string;
  stateDigest: string;
};

export function createP112CapturePreparationProof(input: {
  target: P112TierBTarget;
  preparedBy: P112TierBTarget['owner'];
  preparedAt: string;
  source: string;
  nonce: string;
  signingKey: string;
  observations: P112CapturePreparationProof['observations'];
}): P112CapturePreparationProof {
  const unsigned = {
    targetId: input.target.id,
    stateId: input.target.stateId,
    fixtureAlias: input.target.fixtureAlias,
    route: input.target.route,
    preparedBy: input.preparedBy,
    preparedAt: input.preparedAt,
    source: input.source,
    nonce: input.nonce,
    observations: input.observations,
  };
  const signed = {
    ...unsigned,
    stateDigest: createHash('sha256').update(JSON.stringify(input.observations)).digest('hex'),
  };
  const proof = Object.freeze({
    ...signed,
    signature: createHmac('sha256', Buffer.from(input.signingKey, 'hex'))
      .update(JSON.stringify(signed))
      .digest('hex'),
  });
  validateP112CapturePreparationProof(proof, input.target, input.signingKey);
  return Object.freeze(proof);
}

export function validateP112CapturePreparationProof(
  proof: P112CapturePreparationProof,
  target: P112TierBTarget,
  signingKey?: string,
): void {
  if (
    proof.targetId !== target.id ||
    proof.stateId !== target.stateId ||
    proof.fixtureAlias !== target.fixtureAlias ||
    proof.route !== target.route ||
    proof.preparedBy !== target.owner
  ) {
    throw new Error('P1.12 capture preparation proof owner/state/fixture/route mismatch');
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(proof.preparedAt) ||
    proof.source.trim().length === 0 ||
    !/^[a-f0-9]{32,64}$/u.test(proof.nonce) ||
    !/^[a-f0-9]{64}$/u.test(proof.signature) ||
    !/^[a-f0-9]{64}$/u.test(proof.stateDigest) ||
    !Number.isInteger(proof.observations?.responseStatus) ||
    proof.observations.responseStatus < 200 ||
    proof.observations.responseStatus >= 600 ||
    proof.observations.finalUrl !== new URL(target.route, 'http://127.0.0.1:3001').href ||
    proof.observations.documentStatus !== 'complete' ||
    !Number.isInteger(proof.observations.enabledControlCount) ||
    proof.observations.enabledControlCount < 0 ||
    proof.observations.stateSelectors.length === 0 ||
    proof.observations.stateSelectors.some(
      ({ selector, count, visibleCount }) =>
        selector.trim().length === 0 || count < 1 || visibleCount < 1 || visibleCount > count,
    )
  ) {
    throw new Error('P1.12 capture preparation proof source/observations are incomplete');
  }
  const observedDigest = createHash('sha256')
    .update(JSON.stringify(proof.observations))
    .digest('hex');
  if (observedDigest !== proof.stateDigest)
    throw new Error('P1.12 capture preparation state digest mismatch');
  const expectedPrefix = target.owner === 'tier-b-direct' ? 'tier-a-route:' : 'tier-c-journey:';
  if (proof.source !== `${expectedPrefix}${target.stateId}`) {
    throw new Error('P1.12 capture preparation proof source does not match its owner');
  }
  if (signingKey) {
    if (!/^[a-f0-9]{64}$/u.test(signingKey)) throw new Error('P1.12 signing key is invalid');
    const { signature, ...unsigned } = proof;
    const expected = createHmac('sha256', Buffer.from(signingKey, 'hex'))
      .update(JSON.stringify(unsigned))
      .digest('hex');
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new Error('P1.12 capture preparation proof signature mismatch');
    }
  }
}

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
] as const;
const APPLICATION_VIEWPORT = { width: 1536, height: 1024 } as const;
const THEMES = ['light', 'dark'] as const;

export type P112Capture = {
  targetId: string;
  family: string;
  route: string;
  stateId: `S${number}`;
  theme: (typeof THEMES)[number];
  viewport: { width: number; height: number };
  dsf: 1;
  fullPage: true;
  relativePath: string;
};

export function buildP112CapturePlan(): readonly P112Capture[] {
  return P112_TIER_B_TARGETS.flatMap((target) => {
    const viewports =
      target.family === 'application' ? [...VIEWPORTS, APPLICATION_VIEWPORT] : VIEWPORTS;
    return THEMES.flatMap((theme) =>
      viewports.map((viewport) => ({
        targetId: target.id,
        family: target.family,
        route: target.route,
        stateId: target.stateId,
        theme,
        viewport,
        dsf: 1 as const,
        fullPage: true as const,
        relativePath: `screenshots/${target.family}/${theme}/${viewport.width}x${viewport.height}/${target.stateId}.png`,
      })),
    );
  });
}

export async function verifyP112ReferenceFiles(repositoryRoot: string) {
  const result = await Promise.all(
    P112_REFERENCES.map(async (reference) => {
      const absolute = resolveInside(repositoryRoot, reference.sourcePath);
      await assertP112NoSymlinkPath(repositoryRoot, absolute);
      const bytes = await readFile(absolute);
      const dimensions = await decodePngDimensions(bytes);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (dimensions.width !== reference.width || dimensions.height !== reference.height) {
        throw new Error(`P1.12 reference ${reference.id} dimensions mismatch`);
      }
      if (sha256 !== reference.sha256)
        throw new Error(`P1.12 reference ${reference.id} SHA-256 mismatch`);
      return { ...reference, verified: true as const };
    }),
  );
  for (const target of P112_TIER_B_TARGETS) {
    if (target.reference.kind !== 'closest-pattern') continue;
    const evidence = target.reference.sourceEvidence;
    if (
      !/^P1\.(?:04|06|07|08|09|10|11)@/u.test(evidence.version) ||
      evidence.section.trim().length === 0
    ) {
      throw new Error(`P1.12 closest-pattern source evidence invalid: ${target.id}`);
    }
    const evidencePath = resolveInside(repositoryRoot, evidence.path);
    await assertP112NoSymlinkPath(repositoryRoot, evidencePath);
    const contents = await readFile(evidencePath, 'utf8');
    const sectionHeading = evidence.section.split(' — ')[0]!;
    if (contents.trim().length === 0 || !contents.includes(sectionHeading))
      throw new Error(`P1.12 closest-pattern source evidence empty: ${target.id}`);
  }
  return result;
}

const SECRET_TEXT_PATTERNS = [
  /otpauth:\/\//iu,
  /(?:^|[?&\s])secret\s*=/iu,
  /\beyJ[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{8,}\b/u,
  /\b[A-Z2-7]{24,}\b/u,
  /\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2,}\b/iu,
  /(?<!placeholder:)\b[A-Z0-9._%+-]+@(?!mandoob\.ae\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /(?<!placeholder:)\+971(?:[\s()-]*\d){7,12}\b/u,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
  /(?:\/home\/|\/run\/media\/|\/var\/|node_modules\/)[^\s]*/iu,
  /\b(?:postgres|sqlstate|supabase|database error|provider error|relation [^\n]+ does not exist)\b/iu,
  /\b(?:user|account|customer|application|tenant|company)[_-]id\s*[:=]\s*[a-z0-9_-]{6,}\b/iu,
  /\b(?:usr|acct|cus|app|tenant)_[a-z0-9]{8,}\b/iu,
  /\b(?:password|totp|otp|one-time-code)[\t ]*[:=][\t ]*\S+/iu,
  /\bname:[^=\s]*(?:full[-_]?name|name)[^=\s]*=[\t ]*[\p{L}'-]{2,}(?:[\t ]+[\p{L}'-]{2,})+/iu,
] as const;
export function assertP112CapturePrivacy(input: {
  stateId: string;
  visibleText: string;
  visibleSelectors: readonly string[];
  forbiddenFixtureValues?: readonly string[];
}): void {
  if ((P112_NEVER_CAPTURE_STATE_IDS as readonly string[]).includes(input.stateId)) {
    throw new Error(`P1.12 secret-bearing MFA state ${input.stateId} must never be captured`);
  }
  const secretPatternIndex = SECRET_TEXT_PATTERNS.findIndex((pattern) =>
    pattern.test(input.visibleText),
  );
  if (secretPatternIndex >= 0)
    throw new Error(
      `P1.12 secret-bearing content must not be captured (rule ${secretPatternIndex})`,
    );
  if (
    (input.forbiddenFixtureValues ?? []).some(
      (value) => value.trim().length > 0 && input.visibleText.includes(value),
    )
  ) {
    throw new Error('P1.12 fixture PII or private value must not be captured');
  }
  if (input.visibleSelectors.length > 0) {
    throw new Error('P1.12 secret-bearing surface must not be captured');
  }
}

type CriterionDecision = 'pass' | 'deliberate-difference' | 'reject';
export type P112CriterionReview = { decision: CriterionDecision; rationale?: string };
export type P112PrivacyReview = {
  reviewer: string;
  result: 'pass';
  tools: readonly ['dom-text-scan', 'visual-review', 'browser-page-screenshot'];
};
export type P112ImageDecode = {
  engine: 'chromium';
  result: 'pass';
  width: number;
  height: number;
};

export type P112ScreenshotManifestRow = {
  file: string;
  family: string;
  route: string;
  state: string;
  locale: 'en';
  theme: 'light' | 'dark';
  viewport: { width: number; height: number };
  fullPageDimensions: { width: number; height: number };
  dsf: 1;
  fixture: string;
  timestamp: string;
  reference: P112TierBTarget['reference'];
  comparisonMethod: 'structural-review';
  pixelSimilarityClaim: false;
  comparisonScaling: '1:1-css-pixel';
  privacy: P112PrivacyReview & { exclusions: readonly string[] };
  imageDecode: P112ImageDecode;
  preparation: P112CapturePreparationProof;
  decision: {
    result: 'pass' | 'reject';
    summary: string;
    reviewedPath: string;
    reviewedSha256: string;
    reviewedAt: string;
    criteria: Readonly<Record<P112ParityCriterion, P112CriterionReview>>;
  };
  sha256: string;
};

export function createP112ScreenshotManifestRow(input: {
  capture: P112Capture;
  fullPageWidth: number;
  fullPageHeight: number;
  fixtureAlias: string;
  timestamp: string;
  privacyReview: P112PrivacyReview;
  decisionSummary: string;
  reviewedPath: string;
  reviewedSha256: string;
  reviewedAt: string;
  criteria: Record<string, P112CriterionReview>;
  comparisonScaling: '1:1-css-pixel';
  imageDecode: P112ImageDecode;
  preparation: P112CapturePreparationProof;
  sha256: string;
}): P112ScreenshotManifestRow {
  const target = P112_TIER_B_TARGETS.find(({ id }) => id === input.capture.targetId);
  if (!target) throw new Error('P1.12 unknown Tier B target');
  const criteria = validateCriteria(input.criteria);
  if (input.fixtureAlias !== target.fixtureAlias || input.fixtureAlias.trim().length === 0) {
    throw new Error('P1.12 screenshot fixture alias does not match the frozen target');
  }
  validateP112CapturePreparationProof(input.preparation, target);
  if (input.privacyReview.reviewer.trim().length === 0) {
    throw new Error('P1.12 privacy reviewer is required');
  }
  if (
    input.privacyReview.result !== 'pass' ||
    input.privacyReview.tools.join(',') !== 'dom-text-scan,visual-review,browser-page-screenshot'
  ) {
    throw new Error('P1.12 actual privacy reviewer/tool result is required');
  }
  if (input.decisionSummary.trim().length === 0) {
    throw new Error('P1.12 parity decision summary is required');
  }
  if (input.reviewedPath !== input.capture.relativePath || input.reviewedSha256 !== input.sha256) {
    throw new Error('P1.12 review must bind the exact retained PNG path and SHA-256');
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.reviewedAt) ||
    Date.parse(input.reviewedAt) <= Date.parse(input.timestamp)
  ) {
    throw new Error('P1.12 review must occur after the provisional capture');
  }
  if (input.comparisonScaling !== '1:1-css-pixel') {
    throw new Error('P1.12 comparison scaling must match the 1:1 review artifact');
  }
  if (
    input.imageDecode.engine !== 'chromium' ||
    input.imageDecode.result !== 'pass' ||
    input.imageDecode.width !== input.fullPageWidth ||
    input.imageDecode.height !== input.fullPageHeight
  ) {
    throw new Error('P1.12 real Chromium PNG decode proof is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.timestamp)) {
    throw new Error('P1.12 screenshot timestamp must be UTC ISO-8601');
  }
  if (!/^[a-f0-9]{64}$/u.test(input.sha256)) throw new Error('P1.12 screenshot SHA-256 invalid');
  return {
    file: input.capture.relativePath,
    family: input.capture.family,
    route: input.capture.route,
    state: input.capture.stateId,
    locale: 'en',
    theme: input.capture.theme,
    viewport: input.capture.viewport,
    fullPageDimensions: { width: input.fullPageWidth, height: input.fullPageHeight },
    dsf: 1,
    fixture: input.fixtureAlias,
    timestamp: input.timestamp,
    reference: target.reference,
    comparisonMethod: 'structural-review',
    pixelSimilarityClaim: false,
    comparisonScaling: input.comparisonScaling,
    privacy: {
      ...input.privacyReview,
      exclusions: [
        'browser chrome',
        'identity and contact data',
        'tokens, cookies, and private identifiers',
        'QR, manual TOTP secret, and recovery codes',
        'raw provider, database, and private-path errors',
      ],
    },
    imageDecode: input.imageDecode,
    preparation: input.preparation,
    decision: {
      result: Object.values(criteria).some(({ decision }) => decision === 'reject')
        ? 'reject'
        : 'pass',
      summary: input.decisionSummary,
      reviewedPath: input.reviewedPath,
      reviewedSha256: input.reviewedSha256,
      reviewedAt: input.reviewedAt,
      criteria,
    },
    sha256: input.sha256,
  };
}

export async function reconcileP112ScreenshotEvidence(input: {
  screenshotRoot: string;
  rows: readonly P112ScreenshotManifestRow[];
  plannedCaptures: readonly P112Capture[];
  sha256sums: string;
  allowAdditionalPngs?: boolean;
}): Promise<{ manifestRows: number; pngFiles: number; hashRows: number }> {
  const planned = new Map(input.plannedCaptures.map((capture) => [capture.relativePath, capture]));
  if (planned.size !== input.plannedCaptures.length)
    throw new Error('P1.12 duplicate planned screenshot path');
  const rows = new Map(input.rows.map((row) => [row.file, row]));
  if (rows.size !== input.rows.length) throw new Error('P1.12 duplicate screenshot manifest path');
  if (rows.size !== planned.size || [...planned.keys()].some((file) => !rows.has(file))) {
    throw new Error('P1.12 screenshot manifest does not match frozen capture plan');
  }
  const hashes = parseSha256sums(input.sha256sums);
  const pngFiles = (await listPngs(path.join(input.screenshotRoot, 'screenshots')))
    .map((file) => path.posix.join('screenshots', path.posix.normalize(file)))
    .sort();
  const expectedFiles = [...rows.keys()].sort();
  if (expectedFiles.some((file) => !pngFiles.includes(file))) {
    throw new Error('P1.12 actual PNG set does not match screenshot manifest');
  }
  if (!input.allowAdditionalPngs && pngFiles.length !== expectedFiles.length) {
    throw new Error('P1.12 actual PNG set contains unmanifested screenshots');
  }
  if (hashes.size !== rows.size || [...rows.keys()].some((file) => !hashes.has(file))) {
    throw new Error('P1.12 sha256sums does not match screenshot manifest');
  }

  for (const [file, row] of rows) {
    const capture = planned.get(file)!;
    validateManifestIdentity(row, capture);
    const screenshotPath = resolveInside(input.screenshotRoot, file);
    await assertP112NoSymlinkPath(input.screenshotRoot, screenshotPath);
    const bytes = await readFile(screenshotPath);
    const dimensions = await decodePngDimensions(bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== row.sha256 || sha256 !== hashes.get(file)) {
      throw new Error(`P1.12 screenshot ${file} SHA-256 mismatch`);
    }
    if (
      dimensions.width !== row.fullPageDimensions.width * row.dsf ||
      dimensions.height !== row.fullPageDimensions.height * row.dsf ||
      row.fullPageDimensions.width !== row.viewport.width
    ) {
      throw new Error(`P1.12 screenshot ${file} dimensions mismatch`);
    }
  }
  return {
    manifestRows: rows.size,
    pngFiles: input.allowAdditionalPngs ? rows.size : pngFiles.length,
    hashRows: hashes.size,
  };
}

export function renderP112SideBySideReviewHtml(
  items: readonly {
    target: P112TierBTarget;
    candidatePath: string;
    referencePaths: readonly string[];
  }[],
): string {
  const cards = items
    .map(({ target, candidatePath, referencePaths }) => {
      const label =
        target.reference.kind === 'closest-pattern'
          ? 'Structural closest-pattern review'
          : `Strict reference review ${target.reference.id}`;
      const references = referencePaths
        .map(
          (referencePath) =>
            `<figure><figcaption>Immutable reference</figcaption><img src="${escapeHtml(referencePath)}" alt=""></figure>`,
        )
        .join('');
      return `<article><h2>${escapeHtml(label)} — ${escapeHtml(target.route)} ${escapeHtml(target.stateId)}</h2><div class="pair">${references}<figure><figcaption>Candidate</figcaption><img src="${escapeHtml(candidatePath)}" alt=""></figure></div></article>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>P1.12 Tier B structural review</title><style>body{font:16px system-ui;background:#eee;color:#111;margin:0;padding:24px}article{background:#fff;margin:0 0 32px;padding:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}figure{margin:0;overflow:auto;max-height:80vh}img{display:block;width:auto;max-width:none;height:auto}figcaption{font-weight:700;margin-bottom:8px;position:sticky;top:0;background:#fff}</style></head><body><h1>P1.12 Tier B structural review</h1><p>Images render at 1:1 CSS pixels; no proportional scaling and no pixel-similarity metric are used.</p>${cards}</body></html>`;
}

function validateCriteria(
  input: Record<string, P112CriterionReview>,
): Record<P112ParityCriterion, P112CriterionReview> {
  const allowed = new Set<CriterionDecision>(['pass', 'deliberate-difference', 'reject']);
  if (Object.keys(input).length !== P112_PARITY_CRITERIA.length) {
    throw new Error('P1.12 parity decision criteria incomplete');
  }
  const result = {} as Record<P112ParityCriterion, P112CriterionReview>;
  for (const criterion of P112_PARITY_CRITERIA) {
    const review = input[criterion];
    if (!review || !allowed.has(review.decision))
      throw new Error(`P1.12 parity decision missing ${criterion}`);
    if (
      review.decision === 'deliberate-difference' &&
      (!review.rationale || review.rationale.trim().length === 0)
    ) {
      throw new Error(`P1.12 deliberate difference rationale missing ${criterion}`);
    }
    result[criterion] = review;
  }
  return result;
}

function validateManifestIdentity(row: P112ScreenshotManifestRow, capture: P112Capture): void {
  if (
    row.file !== capture.relativePath ||
    row.family !== capture.family ||
    row.route !== capture.route ||
    row.state !== capture.stateId ||
    row.theme !== capture.theme ||
    row.viewport.width !== capture.viewport.width ||
    row.viewport.height !== capture.viewport.height ||
    row.dsf !== 1 ||
    row.locale !== 'en' ||
    row.comparisonMethod !== 'structural-review' ||
    row.pixelSimilarityClaim !== false ||
    row.comparisonScaling !== '1:1-css-pixel' ||
    row.privacy.result !== 'pass' ||
    row.imageDecode.engine !== 'chromium' ||
    row.imageDecode.result !== 'pass' ||
    row.imageDecode.width !== row.fullPageDimensions.width ||
    row.imageDecode.height !== row.fullPageDimensions.height ||
    row.decision.result !== 'pass' ||
    row.decision.reviewedPath !== row.file ||
    row.decision.reviewedSha256 !== row.sha256 ||
    Date.parse(row.decision.reviewedAt) <= Date.parse(row.timestamp)
  ) {
    throw new Error(`P1.12 screenshot ${row.file} manifest identity rejected`);
  }
  const target = P112_TIER_B_TARGETS.find(({ id }) => id === capture.targetId);
  if (!target) throw new Error('P1.12 screenshot target missing during reconciliation');
  validateP112CapturePreparationProof(row.preparation, target);
  validateCriteria(row.decision.criteria);
}

async function decodePngDimensions(bytes: Buffer): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) throw new Error();
    await sharp(bytes, { failOn: 'error' }).raw().toBuffer();
    return { width: metadata.width, height: metadata.height };
  } catch {
    throw new Error('P1.12 screenshot/reference PNG is not openable by the image decoder');
  }
}

function parseSha256sums(contents: string): Map<string, string> {
  const rows = contents.trim() ? contents.trimEnd().split('\n') : [];
  const result = new Map<string, string>();
  const seen = new Set<string>();
  for (const line of rows) {
    const match = /^([a-f0-9]{64})  ([^\r\n]+)$/u.exec(line);
    if (!match || path.isAbsolute(match[2]!) || match[2]!.includes('..') || seen.has(match[2]!)) {
      throw new Error('P1.12 malformed, unsafe, or duplicate sha256sums row');
    }
    seen.add(match[2]!);
    if (!match[2]!.endsWith('.png') || !match[2]!.startsWith('screenshots/')) continue;
    if (
      !/^screenshots\/[a-z0-9-]+\/(?:light|dark)\/(?:1280x800|1440x900|1536x1024)\/S\d{3}\.png$/u.test(
        match[2]!,
      )
    ) {
      throw new Error('P1.12 malformed screenshot sha256sums row');
    }
    result.set(match[2]!, match[1]!);
  }
  return result;
}

async function listPngs(root: string, relative = ''): Promise<string[]> {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const child = path.posix.join(relative.split(path.sep).join(path.posix.sep), entry.name);
    if (entry.isDirectory()) result.push(...(await listPngs(root, child)));
    else if (entry.isFile() && entry.name.endsWith('.png')) result.push(child);
  }
  return result;
}

function resolveInside(root: string, relative: string): string {
  if (path.isAbsolute(relative)) throw new Error('P1.12 artifact path must be relative');
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('P1.12 artifact path escapes its root');
  }
  return resolved;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}
