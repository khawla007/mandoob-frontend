import { createHmac, randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import type { Page, Response } from '@playwright/test';

import {
  buildP112CapturePlan,
  createP112RunCommitment,
  createP112CapturePreparationProof,
  P112_ACCEPTED_BASE_SHA,
  P112_TIER_B_TARGETS,
  type P112Capture,
  type P112CapturePreparationProof,
  type P112TierBTarget,
  type P112RunCommitment,
} from './tier-b';
import { captureP112Screenshot } from './tier-b-capture';
import { writeP112ProvisionalCaptureFragment } from './tier-b-runner';
import { P112_TIER_A_RENDERED_CASES, P112_TIER_A_ROUTES } from './tier-a-manifest';
import { P112_PAGE_PATHS_BY_STATE, P112_PAGE_QUERIES_BY_STATE } from './tier-a-manifest';
import { isP112DeclarativePrefetch, isP112ExpectedBrowserPrefetchAbort } from './prefetch';
import {
  classifyP112BrowserRequest,
  isExpectedP112RequestFailure,
  isP112ExpectedClientNavigationAbort,
  normalizeP112Request,
  type P112NormalizedRequest,
} from './browser-contract';

export const P112_TIER_C_TARGET_IDS = Object.freeze(
  P112_TIER_B_TARGETS.filter(({ owner }) => owner === 'tier-c-prepared').map(({ id }) => id),
);

const TIER_C_STATE_CONTRACT = {
  'free-zones-no-results': {
    route: '/free-zones',
    status: 200,
    selectors: ['.setup-directory__empty'],
  },
  'contact-validation': {
    route: '/contact',
    status: 200,
    selectors: ['#contact-error-summary[role="alert"]'],
  },
  'contact-unavailable': {
    route: '/contact',
    status: 200,
    selectors: ['[data-contact-result][role="status"]'],
  },
  'estimator-result': { route: '/estimate', status: 200, selectors: ['.estimator-result'] },
  'application-setup': { route: '/apply', status: 200, selectors: ['.application-setup'] },
  'application-review': { route: '/apply', status: 200, selectors: ['.application-review'] },
  'application-confirmed': {
    route: '/apply',
    status: 200,
    selectors: ['.application-confirmation'],
  },
  'application-unavailable': {
    route: '/apply',
    status: 200,
    selectors: ['.application-outcome[role="alert"]'],
  },
  'login-validation': { route: '/login', status: 200, selectors: ['form [role="alert"]'] },
  'login-error': { route: '/login', status: 200, selectors: ['form [role="alert"]'] },
  'register-validation': { route: '/register', status: 200, selectors: ['form [role="alert"]'] },
  'generic-cms-ready': {
    route: '/evidence-editorial-page',
    status: 200,
    selectors: ['.cms-editorial-hero'],
  },
  'mfa-enroll-initial': {
    route: '/mfa/enroll',
    status: 200,
    selectors: ['[data-auth-state="ready"]'],
  },
  'mfa-challenge-invalid': {
    route: '/mfa/challenge',
    status: 200,
    selectors: ['[data-auth-state] [role="alert"]'],
  },
  'mfa-enroll-complete': { route: '/', status: 200, selectors: ['.hero'] },
} as const;
export const P112_TIER_C_STATE_CONTRACT: Readonly<
  Record<string, { route: string; status: number; selectors: readonly string[] }>
> = Object.freeze(
  Object.fromEntries(
    Object.entries(TIER_C_STATE_CONTRACT).map(([id, contract]) => [
      id,
      Object.freeze({ ...contract, selectors: Object.freeze([...contract.selectors]) }),
    ]),
  ),
);

export function p112TierBEgressLogPath(profile: string, stateId: string): string {
  if (!/^[a-z-]+$/u.test(profile) || !/^S\d{3}$/u.test(stateId))
    throw new Error('P1.12 Tier B egress identity rejected');
  return `.p1-12-acceptance-runtime/egress/${profile}-${stateId}.jsonl`;
}

export type P112TierBRequestLedger = {
  stateId: string;
  installed: true;
  allowed: P112NormalizedRequest[];
  rejected: P112NormalizedRequest[];
  failures: P112NormalizedRequest[];
};
export type P112SealedTierBRequestLedger = P112TierBRequestLedger & { commitment: string };

function reviewedStaticPaths(): ReadonlySet<string> {
  try {
    return new Set(
      (readdirSync('public', { recursive: true, encoding: 'utf8' }) as string[]).map(
        (entry) => `/${entry.replaceAll('\\', '/')}`,
      ),
    );
  } catch {
    return new Set();
  }
}

const P112_TIER_B_PAGE_PATHS_BY_STATE = (() => {
  const contracts = new Map(
    [...P112_PAGE_PATHS_BY_STATE].map(([stateId, paths]) => [stateId, new Set(paths)]),
  );
  for (const target of P112_TIER_B_TARGETS) {
    const targetUrl = new URL(target.route, 'http://127.0.0.1:3001');
    const pathname = targetUrl.pathname;
    const paths = contracts.get(target.stateId) ?? new Set<string>();
    paths.add(pathname);
    const route = P112_TIER_A_ROUTES.find(
      (candidate) => new URL(candidate.path, 'http://127.0.0.1:3001').pathname === pathname,
    );
    for (const destination of route?.enabledDestinations ?? []) {
      paths.add(new URL(destination, 'http://127.0.0.1:3001').pathname);
    }
    contracts.set(target.stateId, paths);
  }
  for (const stateId of ['S128', 'S138', 'S142']) {
    const paths = contracts.get(stateId) ?? new Set<string>();
    for (const pathname of [
      '/login',
      '/forgot-password',
      '/register',
      '/admin',
      '/mfa/enroll',
      '/mfa/challenge',
      '/',
    ]) {
      paths.add(pathname);
    }
    contracts.set(stateId, paths);
  }
  const freeZoneInteractionPaths = contracts.get('S011') ?? new Set<string>();
  freeZoneInteractionPaths.add('/');
  for (const destination of P112_TIER_A_ROUTES.find(({ id }) => id === 'home')
    ?.enabledDestinations ?? [])
    freeZoneInteractionPaths.add(new URL(destination, 'http://127.0.0.1:3001').pathname);
  contracts.set('S011', freeZoneInteractionPaths);
  return contracts;
})();

const P112_TIER_B_PAGE_QUERIES_BY_STATE = (() => {
  const contracts = new Map(P112_PAGE_QUERIES_BY_STATE);
  for (const target of P112_TIER_B_TARGETS) {
    const url = new URL(target.route, 'http://127.0.0.1:3001');
    const paths = new Map(contracts.get(target.stateId) ?? []);
    const searches = new Set(paths.get(url.pathname) ?? []);
    searches.add(url.search);
    paths.set(url.pathname, searches);
    const route = P112_TIER_A_ROUTES.find(
      (candidate) => new URL(candidate.path, 'http://127.0.0.1:3001').pathname === url.pathname,
    );
    for (const destination of route?.enabledDestinations ?? []) {
      const destinationUrl = new URL(destination, 'http://127.0.0.1:3001');
      const destinationSearches = new Set(paths.get(destinationUrl.pathname) ?? []);
      destinationSearches.add(destinationUrl.search);
      paths.set(destinationUrl.pathname, destinationSearches);
    }
    contracts.set(target.stateId, paths);
  }
  for (const stateId of ['S128', 'S138', 'S142']) {
    const paths = new Map(contracts.get(stateId) ?? []);
    for (const pathname of [
      '/login',
      '/forgot-password',
      '/register',
      '/admin',
      '/mfa/enroll',
      '/mfa/challenge',
      '/',
    ]) {
      const searches = new Set(paths.get(pathname) ?? []);
      searches.add('');
      paths.set(pathname, searches);
    }
    const loginSearches = new Set(paths.get('/login') ?? []);
    loginSearches.add('?next=%2Fmfa%2Fenroll');
    loginSearches.add('?next=%2Fmfa%2Fchallenge');
    paths.set('/login', loginSearches);
    contracts.set(stateId, paths);
  }
  const freeZoneInteractionQueries = new Map(contracts.get('S011') ?? []);
  freeZoneInteractionQueries.set('/', new Set(['']));
  for (const destination of P112_TIER_A_ROUTES.find(({ id }) => id === 'home')
    ?.enabledDestinations ?? []) {
    const url = new URL(destination, 'http://127.0.0.1:3001');
    const searches = new Set(freeZoneInteractionQueries.get(url.pathname) ?? []);
    searches.add(url.search);
    freeZoneInteractionQueries.set(url.pathname, searches);
  }
  contracts.set('S011', freeZoneInteractionQueries);
  return contracts;
})();

export async function installP112TierBRequestGuard(
  page: Pick<Page, 'route' | 'on'>,
  stateId: string,
  evidenceProfile: string,
  fixtureFactorId?: () => string | undefined,
): Promise<P112TierBRequestLedger> {
  const ledger: P112TierBRequestLedger = {
    stateId,
    installed: true,
    allowed: [],
    rejected: [],
    failures: [],
  };
  const suppressedPrefetchUrls = new Set<string>();
  const staticPaths = reviewedStaticPaths();
  await page.route('**/*', async (intercepted) => {
    const request = intercepted.request();
    const input = {
      method: request.method(),
      url: request.url(),
      stateId,
      evidenceProfile,
      fixtureFactorId: fixtureFactorId?.(),
      allowedPagePathsByState: P112_TIER_B_PAGE_PATHS_BY_STATE,
      allowedPageQueriesByState: P112_TIER_B_PAGE_QUERIES_BY_STATE,
      reviewedStaticPaths: staticPaths,
      reviewedNextStaticRoot: '.next/static',
    };
    const decision = classifyP112BrowserRequest(input);
    const normalized = normalizeP112Request(input.method, input.url, stateId, decision.queryShape);
    const requestUrl = new URL(request.url());
    if (
      decision.allowed &&
      ['S128', 'S138', 'S142'].includes(stateId) &&
      request.method() === 'POST' &&
      requestUrl.pathname === '/api/v1/auth/login'
    ) {
      ledger.allowed.push(normalized);
      const response = await intercepted.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await intercepted.fulfill({
        response,
        // Preserve the real auth response/session while preventing a public-acceptance
        // fixture from loading private dashboard data before the MFA journey begins.
        json: { ...body, redirectTo: '/' },
      });
    } else if (
      decision.allowed &&
      isP112DeclarativePrefetch({
        method: request.method(),
        url: request.url(),
        stateId,
        resourceType: request.resourceType(),
        headers: request.headers(),
      })
    ) {
      suppressedPrefetchUrls.add(request.url());
      await intercepted.abort('blockedbyclient');
    } else if (decision.allowed) {
      ledger.allowed.push(normalized);
      await intercepted.continue();
    } else {
      ledger.rejected.push(normalized);
      await intercepted.abort('blockedbyclient');
    }
  });
  page.on('requestfailed', (request) => {
    if (suppressedPrefetchUrls.has(request.url())) return;
    const failure = request.failure()?.errorText ?? '';
    const prefetchInput = {
      method: request.method(),
      url: request.url(),
      stateId,
      evidenceProfile,
      fixtureFactorId: fixtureFactorId?.(),
      resourceType: request.resourceType(),
      headers: request.headers(),
    };
    const prefetchDecision = classifyP112BrowserRequest({
      ...prefetchInput,
      allowedPagePathsByState: P112_TIER_B_PAGE_PATHS_BY_STATE,
      allowedPageQueriesByState: P112_TIER_B_PAGE_QUERIES_BY_STATE,
      reviewedStaticPaths: staticPaths,
      reviewedNextStaticRoot: '.next/static',
    });
    if (
      isP112ExpectedBrowserPrefetchAbort({
        ...prefetchInput,
        allowed: prefetchDecision.allowed,
        failure,
      }) ||
      (['S128', 'S138', 'S142'].includes(stateId) &&
        isP112ExpectedClientNavigationAbort({
          ...prefetchInput,
          allowed: prefetchDecision.allowed,
          failure,
          targetPath: '/',
        })) ||
      (failure === 'net::ERR_BLOCKED_BY_CLIENT' && isP112DeclarativePrefetch(prefetchInput))
    )
      return;
    const normalized = normalizeP112Request(request.method(), request.url(), stateId);
    if (
      ledger.rejected.some(
        ({ method, origin, path }) =>
          method === normalized.method && origin === normalized.origin && path === normalized.path,
      )
    )
      return;
    const input = {
      method: request.method(),
      url: request.url(),
      stateId,
      fixtureFailureTag: request.failure()?.errorText,
    };
    if (!isExpectedP112RequestFailure(input)) {
      ledger.failures.push(normalized);
    }
  });
  return ledger;
}

export function reconcileP112TierBRequestLedger(
  ledger: P112TierBRequestLedger,
  stateId: string,
): void {
  if (!ledger.installed || ledger.stateId !== stateId)
    throw new Error('P1.12 request ledger state mismatch');
  if (ledger.rejected.length > 0)
    throw new Error(
      `P1.12 request ledger contains rejected traffic: ${JSON.stringify(ledger.rejected)}`,
    );
  if (ledger.failures.length > 0)
    throw new Error(`P1.12 request ledger contains failures: ${JSON.stringify(ledger.failures)}`);
}

export function sealP112TierBRequestLedger(
  ledger: P112TierBRequestLedger,
  signingKey: string,
): P112SealedTierBRequestLedger {
  reconcileP112TierBRequestLedger(ledger, ledger.stateId);
  return Object.freeze({
    ...ledger,
    commitment: createHmac('sha256', Buffer.from(signingKey, 'hex'))
      .update(JSON.stringify(ledger))
      .digest('hex'),
  });
}

export function getP112TierBDirectRuns(
  outputRoot: string,
  runCommitment = createP112RunCommitment({
    runId: `p112-test-${randomBytes(8).toString('hex')}`,
    acceptedBaseSha: P112_ACCEPTED_BASE_SHA,
    candidateSha: P112_ACCEPTED_BASE_SHA,
    candidateDigest: '0'.repeat(64),
    candidateDescendsFromAcceptedBase: true,
    signingKey: '0'.repeat(64),
  }),
  signingKey = '0'.repeat(64),
) {
  const direct = P112_TIER_B_TARGETS.filter(({ owner }) => owner === 'tier-b-direct');
  const identities = new Map<string, { stateId: string; profile: string }>();
  for (const target of direct) {
    const rendered = P112_TIER_A_RENDERED_CASES.find(
      ({ stateId, path }) => stateId === target.stateId && path === target.route,
    );
    if (!rendered) throw new Error(`P1.12 direct state has no Tier A setup: ${target.id}`);
    identities.set(`${rendered.profile}:${target.stateId}`, {
      stateId: target.stateId,
      profile: rendered.profile,
    });
  }
  return [...identities.values()].map(({ stateId, profile }) => {
    return {
      command: 'npx',
      args: ['--no-install', 'playwright', 'test', '--config', 'playwright.p1-12-tier-b.config.ts'],
      environment: {
        P112_EVIDENCE_STATE_ID: stateId,
        P112_EVIDENCE_PROFILE: profile,
        P112_BUILD_POLICY: 'start-only',
        P112_EGRESS_LOG_PATH: p112TierBEgressLogPath(profile, stateId),
        P112_TIER_B_OUTPUT_ROOT: outputRoot,
        P112_PROOF_KEY: signingKey,
        P112_PROOF_NONCE: randomBytes(24).toString('hex'),
        P112_RUN_COMMITMENT: JSON.stringify(runCommitment),
      },
    };
  });
}

export function createP112TierCHandoff(outputRoot: string, runCommitment: P112RunCommitment) {
  const ids = new Set(P112_TIER_C_TARGET_IDS);
  return {
    schemaVersion: 1 as const,
    owner: 'tier-c-prepared' as const,
    outputRoot,
    runCommitment,
    captures: buildP112CapturePlan()
      .filter(({ targetId }) => ids.has(targetId))
      .map((capture) => ({ ...capture, owner: 'tier-c-prepared' as const })),
    stateContracts: P112_TIER_C_STATE_CONTRACT,
    protocol: {
      installBeforeNavigation: 'installP112ProofBootstrap',
      requestGuardBeforeNavigation: 'installP112TierBRequestGuard',
      recordAfterJourney: 'observeP112TierCState + commitP112ProofMarker + captureP112Screenshot',
      assembleCommand: 'tier-c-handoff',
    },
  };
}

export async function installP112ProofBootstrap(
  page: Pick<Page, 'addInitScript'>,
  target: P112TierBTarget,
  nonce: string,
): Promise<void> {
  await page.addInitScript(
    ({ targetId, stateId, fixtureAlias, nonce: value }) => {
      Object.defineProperty(window, '__P112_CAPTURE_BOOTSTRAP__', {
        value: Object.freeze({ targetId, stateId, fixtureAlias, nonce: value }),
        configurable: false,
        writable: false,
      });
    },
    { targetId: target.id, stateId: target.stateId, fixtureAlias: target.fixtureAlias, nonce },
  );
}

export async function observeP112DirectState(
  page: Pick<Page, 'url' | 'locator' | 'evaluate'>,
  response: Pick<Response, 'status'> | null,
  target: P112TierBTarget,
): Promise<P112CapturePreparationProof['observations']> {
  const rendered = P112_TIER_A_RENDERED_CASES.find(
    ({ stateId, path }) => stateId === target.stateId && path === target.route,
  );
  if (!rendered || response?.status() !== rendered.expectedStatus) {
    throw new Error('P1.12 direct response status does not match immutable Tier A state');
  }
  return observeP112BrowserState(
    page,
    response,
    target,
    rendered.sections,
    rendered.expectedStatus,
  );
}

async function observeP112BrowserState(
  page: Pick<Page, 'url' | 'locator' | 'evaluate'>,
  response: Pick<Response, 'status'> | null,
  target: P112TierBTarget,
  requiredSelectors: readonly string[],
  expectedStatus: number,
): Promise<P112CapturePreparationProof['observations']> {
  if (response?.status() !== expectedStatus) {
    throw new Error('P1.12 observed response status mismatch');
  }
  const finalUrl = page.url();
  if (finalUrl !== new URL(target.route, 'http://127.0.0.1:3001').href) {
    throw new Error('P1.12 direct final URL mismatch');
  }
  const selectors = requiredSelectors.length > 0 ? requiredSelectors : ['main'];
  const stateSelectors = [];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    await locator.first().waitFor({ state: 'visible' });
    const count = await locator.count();
    const visibleCount = await locator.filter({ visible: true }).count();
    if (count < 1 || visibleCount < 1)
      throw new Error(`P1.12 required state selector missing: ${selector}`);
    stateSelectors.push({ selector, count, visibleCount });
  }
  const runtime = await page.evaluate(() => ({
    documentStatus: document.readyState,
    enabledControlCount: document.querySelectorAll(
      'a[href]:not([aria-disabled="true"]),button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)',
    ).length,
  }));
  if (runtime.documentStatus !== 'complete') throw new Error('P1.12 document is not complete');
  return {
    responseStatus: expectedStatus,
    finalUrl,
    stateSelectors,
    enabledControlCount: runtime.enabledControlCount,
    documentStatus: 'complete',
  };
}

export async function observeP112TierCState(
  page: Pick<Page, 'url' | 'locator' | 'evaluate'>,
  response: Pick<Response, 'status'> | null,
  target: P112TierBTarget,
): Promise<P112CapturePreparationProof['observations']> {
  const contract = P112_TIER_C_STATE_CONTRACT[target.id];
  if (
    target.owner !== 'tier-c-prepared' ||
    !contract ||
    contract.route !== target.route ||
    contract.selectors.some((selector) => selector === 'main')
  ) {
    throw new Error('P1.12 Tier C observation contract is incomplete');
  }
  return observeP112BrowserState(page, response, target, contract.selectors, contract.status);
}

export async function commitP112ProofMarker(
  page: Pick<Page, 'evaluate'>,
  proof: P112CapturePreparationProof,
): Promise<void> {
  await page.evaluate((value) => {
    const bootstrap = (
      window as typeof window & {
        __P112_CAPTURE_BOOTSTRAP__?: Record<string, string>;
      }
    ).__P112_CAPTURE_BOOTSTRAP__;
    if (
      !bootstrap ||
      bootstrap.targetId !== value.targetId ||
      bootstrap.stateId !== value.stateId ||
      bootstrap.fixtureAlias !== value.fixtureAlias ||
      bootstrap.nonce !== value.nonce
    )
      throw new Error('P1.12 proof bootstrap mismatch');
    const marker = document.createElement('meta');
    marker.dataset.p112StateId = value.stateId;
    marker.dataset.p112FixtureAlias = value.fixtureAlias;
    marker.dataset.p112ProofNonce = value.nonce;
    marker.dataset.p112ProofSignature = value.signature;
    document.head.append(marker);
  }, proof);
}

export function createP112ObservedProof(input: {
  target: P112TierBTarget;
  owner: P112TierBTarget['owner'];
  nonce: string;
  signingKey: string;
  observations: P112CapturePreparationProof['observations'];
  preparedAt?: string;
}): P112CapturePreparationProof {
  return createP112CapturePreparationProof({
    target: input.target,
    preparedBy: input.owner,
    preparedAt: input.preparedAt ?? new Date().toISOString(),
    source: `${input.owner === 'tier-b-direct' ? 'tier-a-route' : 'tier-c-journey'}:${input.target.stateId}`,
    nonce: input.nonce,
    signingKey: input.signingKey,
    observations: input.observations,
  });
}

export type P112TierCHandoffCapture = P112Capture & { owner: 'tier-c-prepared' };

export async function recordP112TierCHandoffCapture(input: {
  page: Page;
  capture: P112Capture;
  target: P112TierBTarget;
  outputRoot: string;
  signingKey: string;
  nonce: string;
  response: Pick<Response, 'status'> | null;
  requestLedger: P112TierBRequestLedger;
  runCommitment: P112RunCommitment;
  forbiddenFixtureValues: readonly string[];
}): Promise<void> {
  if (input.target.owner !== 'tier-c-prepared' || input.capture.targetId !== input.target.id) {
    throw new Error('P1.12 Tier C handoff ownership mismatch');
  }
  const observations = await observeP112TierCState(input.page, input.response, input.target);
  reconcileP112TierBRequestLedger(input.requestLedger, input.target.stateId);
  const proof = createP112ObservedProof({
    target: input.target,
    owner: 'tier-c-prepared',
    nonce: input.nonce,
    signingKey: input.signingKey,
    observations,
  });
  await commitP112ProofMarker(input.page, proof);
  const screenshot = await captureP112Screenshot(input.page, input.capture, input.outputRoot, {
    proof,
    signingKey: input.signingKey,
    forbiddenFixtureValues: input.forbiddenFixtureValues,
  });
  await writeP112ProvisionalCaptureFragment(input.outputRoot, 'tier-c-prepared', {
    capture: input.capture,
    capturedAt: new Date().toISOString(),
    fixtureAlias: input.target.fixtureAlias,
    preparation: proof,
    fullPageDimensions: screenshot.fullPageDimensions,
    imageDecode: screenshot.imageDecode,
    sha256: screenshot.sha256,
    requestLedger: sealP112TierBRequestLedger(input.requestLedger, input.signingKey),
    runCommitment: input.runCommitment,
  });
}
