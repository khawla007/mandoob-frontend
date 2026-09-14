import { createHash } from 'node:crypto';
import { test } from '@playwright/test';

import { buildP112CapturePlan, P112_TIER_B_TARGETS } from '../../scripts/p1-12-acceptance/tier-b';
import { captureP112Screenshot } from '../../scripts/p1-12-acceptance/tier-b-capture';
import { writeP112ProvisionalCaptureFragment } from '../../scripts/p1-12-acceptance/tier-b-runner';
import {
  commitP112ProofMarker,
  createP112ObservedProof,
  installP112TierBRequestGuard,
  installP112ProofBootstrap,
  observeP112DirectState,
  reconcileP112TierBRequestLedger,
  sealP112TierBRequestLedger,
} from '../../scripts/p1-12-acceptance/tier-b-playwright';

const stateId = process.env.P112_EVIDENCE_STATE_ID!;
const evidenceProfile = process.env.P112_EVIDENCE_PROFILE!;
const outputRoot = process.env.P112_TIER_B_OUTPUT_ROOT!;
const signingKey = process.env.P112_PROOF_KEY!;
const nonceSeed = process.env.P112_PROOF_NONCE!;
const runCommitment = JSON.parse(
  process.env.P112_RUN_COMMITMENT!,
) as import('../../scripts/p1-12-acceptance/tier-b').P112RunCommitment;
const targets = P112_TIER_B_TARGETS.filter(
  (target) => target.owner === 'tier-b-direct' && target.stateId === stateId,
);
if (targets.length === 0) throw new Error('P1.12 direct spec received no target');

for (const target of targets) {
  test(`${target.id} retained structural evidence`, async ({ page }, testInfo) => {
    const theme = testInfo.project.metadata.p112Theme;
    if (theme !== 'light' && theme !== 'dark') throw new Error('P1.12 missing project theme');
    const viewport = page.viewportSize();
    const capture = buildP112CapturePlan().find(
      (row) =>
        row.targetId === target.id &&
        row.theme === theme &&
        row.viewport.width === viewport?.width &&
        row.viewport.height === viewport.height,
    );
    if (!capture) throw new Error('P1.12 project is not in capture plan');
    const nonce = createHash('sha256').update(`${nonceSeed}:${capture.relativePath}`).digest('hex');
    await page
      .context()
      .addCookies([
        { name: 'NEXT_LOCALE', value: 'en', url: 'http://127.0.0.1:3001', sameSite: 'Lax' },
      ]);
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    await installP112ProofBootstrap(page, target, nonce);
    const requestLedger = await installP112TierBRequestGuard(page, target.stateId, evidenceProfile);
    const response = await page.goto(target.route, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    const observations = await observeP112DirectState(page, response, target);
    const proof = createP112ObservedProof({
      target,
      owner: 'tier-b-direct',
      nonce,
      signingKey,
      observations,
    });
    await commitP112ProofMarker(page, proof);
    const screenshot = await captureP112Screenshot(page, capture, outputRoot, {
      proof,
      signingKey,
      forbiddenFixtureValues: [],
    });
    reconcileP112TierBRequestLedger(requestLedger, target.stateId);
    await writeP112ProvisionalCaptureFragment(outputRoot, 'tier-b-direct', {
      capture,
      capturedAt: new Date().toISOString(),
      fixtureAlias: target.fixtureAlias,
      preparation: proof,
      fullPageDimensions: screenshot.fullPageDimensions,
      imageDecode: screenshot.imageDecode,
      sha256: screenshot.sha256,
      requestLedger: sealP112TierBRequestLedger(requestLedger, signingKey),
      runCommitment,
    });
  });
}
