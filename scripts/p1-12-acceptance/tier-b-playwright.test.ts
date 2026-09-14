import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { buildP112CapturePlan, P112_TIER_B_TARGETS } from './tier-b';

let subject: typeof import('./tier-b-playwright') | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  subject = require('./tier-b-playwright') as typeof import('./tier-b-playwright');
} catch {}

test('exposes executable direct runs and an explicit complete Tier C handoff', () => {
  assert.ok(subject);
  const runs = subject.getP112TierBDirectRuns('/evidence');
  assert.ok(runs.length > 0);
  assert.ok(runs.every(({ args }) => args.includes('playwright.p1-12-tier-b.config.ts')));
  assert.ok(runs.every(({ environment }) => environment.P112_BUILD_POLICY === 'start-only'));
  assert.ok(runs.every(({ environment }) => /^[a-f0-9]{64}$/u.test(environment.P112_PROOF_KEY)));
  assert.ok(
    runs.every(
      ({ environment }) =>
        environment.P112_EGRESS_LOG_PATH ===
        `.p1-12-acceptance-runtime/egress/${environment.P112_EVIDENCE_PROFILE}-${environment.P112_EVIDENCE_STATE_ID}.jsonl`,
    ),
  );
  const tierC = subject.createP112TierCHandoff(
    '/evidence',
    JSON.parse(runs[0]!.environment.P112_RUN_COMMITMENT),
  );
  const expected = buildP112CapturePlan().filter((capture) =>
    subject!.P112_TIER_C_TARGET_IDS.includes(capture.targetId),
  );
  assert.equal(tierC.captures.length, expected.length);
  assert.ok(tierC.captures.every(({ owner }) => owner === 'tier-c-prepared'));
  assert.deepEqual(
    Object.keys(subject.P112_TIER_C_STATE_CONTRACT).sort(),
    [...subject.P112_TIER_C_TARGET_IDS].sort(),
  );
  assert.ok(
    Object.values(subject.P112_TIER_C_STATE_CONTRACT).every(
      ({ selectors }) => !selectors.includes('main'),
    ),
  );
});

test('ships a concrete Playwright config/spec and executable direct/handoff/finalize CLI', async () => {
  const root = process.cwd();
  const config = await readFile(path.join(root, 'playwright.p1-12-tier-b.config.ts'), 'utf8');
  const spec = await readFile(path.join(root, 'tests/p1-12-acceptance/tier-b.spec.ts'), 'utf8');
  const cli = await readFile(path.join(root, 'scripts/p1-12-acceptance/tier-b-cli.ts'), 'utf8');
  assert.match(config, /tier-b\.spec\.ts/u);
  assert.match(config, /deviceScaleFactor:\s*1/u);
  assert.match(config, /reuseExistingServer:\s*false/u);
  assert.match(config, /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/u);
  assert.match(config, /launchOptions/u);
  assert.doesNotMatch(config, /egress\/tier-b-/u);
  assert.match(spec, /installP112ProofBootstrap/u);
  assert.match(spec, /observeP112DirectState/u);
  assert.match(spec, /waitForLoadState\('load'\)[\s\S]*observeP112DirectState/u);
  assert.match(spec, /captureP112Screenshot/u);
  assert.match(spec, /writeP112ProvisionalCaptureFragment/u);
  assert.doesNotMatch(spec, /P112_TIER_B_REVIEW_INPUT|reviewInput/u);
  assert.doesNotMatch(spec, /test\.skip/u);
  assert.match(cli, /case 'direct'/u);
  assert.match(cli, /case 'tier-c-handoff'/u);
  assert.match(cli, /case 'finalize'/u);
  assert.match(cli, /merge-base[^\n]+--is-ancestor/u);
  assert.match(cli, /P112_ACCEPTED_BASE_SHA/u);
});

test('ships an executable Tier C browser runner instead of a handoff-only placeholder', async () => {
  const root = process.cwd();
  const config = await readFile(path.join(root, 'playwright.p1-12-tier-c.config.ts'), 'utf8');
  const spec = await readFile(path.join(root, 'tests/p1-12-acceptance/tier-c.spec.ts'), 'utf8');
  const runner = await readFile(
    path.join(root, 'scripts/p1-12-acceptance/tier-c-runner.ts'),
    'utf8',
  );
  const cli = await readFile(path.join(root, 'scripts/p1-12-acceptance/tier-b-cli.ts'), 'utf8');
  assert.match(config, /tier-c\.spec\.ts/u);
  assert.match(config, /reuseExistingServer:\s*false/u);
  assert.match(spec, /recordP112TierCHandoffCapture/u);
  assert.match(spec, /prepareP112TierCState/u);
  assert.doesNotMatch(spec, /test\.skip/u);
  assert.match(runner, /P112_TIER_C_TARGET_IDS/u);
  assert.match(runner, /parseAndReconcileP112EgressLog/u);
  assert.match(
    runner,
    /\['application-confirmed', 'estimator-result', 'generic-cms-ready'\]\.includes\(\s*target\.id,?\s*\)/u,
  );
  const journeys = await readFile(
    path.join(root, 'scripts/p1-12-acceptance/tier-c-journeys.ts'),
    'utf8',
  );
  const settleInteractivePage = journeys.match(
    /async function settleInteractivePage[\s\S]*?\n\}/u,
  )?.[0];
  assert.ok(settleInteractivePage);
  assert.match(
    settleInteractivePage,
    /page\.evaluate[\s\S]*page\.waitForLoadState\('networkidle'\)/u,
    'post-hydration requests must settle before a Tier C navigation can cancel them',
  );
  assert.match(
    settleInteractivePage,
    /performance[\s\S]*\.getEntriesByName[\s\S]*cta-mashrabiya\.png[\s\S]*responseEnd/u,
    'homepage settlement must retain the late WebGL texture request through completion',
  );
  const completedMfa = journeys.match(
    /async function prepareCompletedMfaEnrollment[\s\S]*?\n\}/u,
  )?.[0];
  assert.ok(completedMfa);
  assert.match(
    completedMfa,
    /waitForURL\(\(url\) => url\.pathname === '\/'\);[\s\S]*settleInteractivePage\(page\);[\s\S]*page\.reload/u,
    'MFA completion must settle the destination before reload can cancel late assets',
  );
  const loginFixture = journeys.match(
    /async function loginFixture[\s\S]*?\n\}\n\nasync function completeMfaEnrollment/u,
  )?.[0];
  assert.ok(loginFixture);
  assert.doesNotMatch(loginFixture, /page\.evaluate|fetch\(/u);
  assert.match(loginFixture, /input\[type="email"\][\s\S]*\.fill\(fixture\.email\)/u);
  assert.match(loginFixture, /input\[type="password"\][\s\S]*\.fill\(fixture\.password\)/u);
  assert.match(loginFixture, /getByRole\('button', \{ name: 'Sign in' \}\)\.click\(\)/u);
  assert.match(loginFixture, /nextPath: '\/mfa\/enroll' \| '\/mfa\/challenge'/u);
  assert.match(loginFixture, /waitForURL\(\(url\) => url\.pathname === '\/'\)/u);
  assert.match(loginFixture, /page\.goto\(nextPath/u);
  assert.match(
    journeys,
    /async function prepareInvalidMfaChallenge[\s\S]*const retainedResponse = await loginFixture\(page, fixture, '\/mfa\/challenge'\)[\s\S]*return retainedResponse/u,
  );
  assert.match(
    journeys,
    /async function prepareCompletedMfaEnrollment[\s\S]*const retainedResponse = await page\.reload[\s\S]*return retainedResponse/u,
  );
  assert.match(
    journeys,
    /case 'mfa-enroll-initial':[\s\S]*retainedResponse = await loginFixture[\s\S]*return retainedResponse/u,
  );
  assert.match(
    await readFile(path.join(root, 'scripts/p1-12-acceptance/tier-b-playwright.ts'), 'utf8'),
    /pathname === '\/api\/v1\/auth\/login'[\s\S]*redirectTo: '\/'/u,
  );
  assert.match(journeys, /async function exerciseHomepageInteractions/u);
  assert.match(journeys, /emulateMedia\(\{ reducedMotion: 'reduce' \}\)/u);
  assert.match(journeys, /aria-roledescription="carousel"/u);
  assert.match(journeys, /home-faq__trigger/u);
  assert.match(journeys, /getByRole\('button', \{ name: 'Clear filters' \}\)/u);
  assert.match(journeys, /getByRole\('button', \{ name: 'Save locally' \}\)/u);
  assert.match(journeys, /getByRole\('dialog'/u);
  assert.match(journeys, /press\('Escape'\)/u);
  assert.match(journeys, /getByRole\('button', \{ name: 'Edit', exact: true \}\)/u);
  assert.match(cli, /--only-target/u);
});

test('Tier C handoff derives frozen state-specific observations from the browser', async () => {
  assert.ok(subject);
  const target = P112_TIER_B_TARGETS.find(({ owner }) => owner === 'tier-c-prepared')!;
  const observations = await subject.observeP112TierCState(
    {
      url: () => new URL(target.route, 'http://127.0.0.1:3001').href,
      locator: (selector: string) => ({
        first: () => ({ waitFor: async () => undefined }),
        count: async () =>
          subject!.P112_TIER_C_STATE_CONTRACT[target.id]!.selectors.includes(selector) ? 1 : 0,
        filter: () => ({ count: async () => 1 }),
      }),
      evaluate: async () => ({ documentStatus: 'complete', enabledControlCount: 3 }),
    } as never,
    { status: () => 200 },
    target,
  );
  assert.deepEqual(
    observations.stateSelectors.map(({ selector }) => selector),
    subject.P112_TIER_C_STATE_CONTRACT[target.id]!.selectors,
  );
  assert.equal(observations.enabledControlCount, 3);
  await assert.rejects(
    (subject.observeP112TierCState as unknown as (...args: unknown[]) => Promise<unknown>)(
      {} as never,
      null,
      target,
      ['main'],
    ),
    /status|URL|selector|contract/u,
  );
});

test('S142 completion contract uses the source-backed homepage hero selector', async () => {
  assert.ok(subject);
  assert.deepEqual(subject.P112_TIER_C_STATE_CONTRACT['mfa-enroll-complete'], {
    route: '/',
    status: 200,
    selectors: ['.hero'],
  });
  const heroSource = await readFile('src/components/site/home/HeroSection.tsx', 'utf8');
  assert.match(heroSource, /<section className="hero"/u);
});

test('ignores only exact aborted MFA-fixture homepage RSC navigations', async () => {
  assert.ok(subject);
  const request = {
    method: () => 'GET',
    url: () => 'http://127.0.0.1:3001/?_rsc=login1',
    resourceType: () => 'fetch',
    headers: () => ({ rsc: '1' }),
    failure: () => ({ errorText: 'net::ERR_ABORTED' }),
  };
  for (const stateId of ['S128', 'S138', 'S142']) {
    let failedHandler: ((request: never) => void) | undefined;
    const ledger = await subject.installP112TierBRequestGuard(
      {
        route: async () => undefined,
        on: (event: string, callback: (request: never) => void) => {
          if (event === 'requestfailed') failedHandler = callback;
        },
      } as never,
      stateId,
      'production',
    );
    failedHandler!(request as never);
    assert.deepEqual(ledger.failures, []);

    failedHandler!({
      ...request,
      url: () => 'http://127.0.0.1:3001/contact?_rsc=login1',
    } as never);
    assert.equal(ledger.failures.length, 1);
  }
});

test('installs the Tier A default-deny request classifier before navigation', async () => {
  assert.ok(subject);
  let handler: ((route: never) => Promise<void>) | undefined;
  const ledger = await subject.installP112TierBRequestGuard(
    {
      route: async (_pattern: string, callback: (route: never) => Promise<void>) => {
        handler = callback;
      },
      on: () => undefined,
    } as never,
    'S007',
    'production',
  );
  let aborted = false;
  await handler!({
    request: () => ({ method: () => 'GET', url: () => 'https://example.com/private?token=x' }),
    abort: async () => {
      aborted = true;
    },
    continue: async () => undefined,
  } as never);
  assert.equal(aborted, true);
  assert.throws(() => subject.reconcileP112TierBRequestLedger(ledger, 'S007'), /rejected/u);
  assert.deepEqual(ledger.rejected[0], {
    method: 'GET',
    origin: 'https://example.com',
    path: '/private',
    stateId: 'S007',
    queryShape: 'unreviewed',
  });
  await handler!({
    request: () => ({ method: () => 'GET', url: () => 'http://127.0.0.1:3001/?token=secret' }),
    abort: async () => undefined,
    continue: async () => assert.fail('privacy-bearing query must not continue'),
  } as never);
  assert.equal(ledger.rejected[1]?.queryShape, 'unreviewed');
  assert.doesNotMatch(JSON.stringify(ledger), /token|secret/u);
});
