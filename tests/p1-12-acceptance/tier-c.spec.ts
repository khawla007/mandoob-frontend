import { createHash } from 'node:crypto';
import path from 'node:path';
import { test } from '@playwright/test';

import { buildP112CapturePlan, P112_TIER_B_TARGETS } from '../../scripts/p1-12-acceptance/tier-b';
import {
  installP112ProofBootstrap,
  installP112TierBRequestGuard,
  recordP112TierCHandoffCapture,
} from '../../scripts/p1-12-acceptance/tier-b-playwright';
import { prepareP112TierCState } from '../../scripts/p1-12-acceptance/tier-c-journeys';
import { createSecretStore } from '../../scripts/p1-12-acceptance/secrets';

const targetId = process.env.P112_TIER_C_TARGET_ID!;
const evidenceProfile = process.env.P112_EVIDENCE_PROFILE!;
const outputRoot = process.env.P112_TIER_B_OUTPUT_ROOT!;
const signingKey = process.env.P112_PROOF_KEY!;
const nonceSeed = process.env.P112_PROOF_NONCE!;
const runCommitment = JSON.parse(
  process.env.P112_RUN_COMMITMENT!,
) as import('../../scripts/p1-12-acceptance/tier-b').P112RunCommitment;
const target = P112_TIER_B_TARGETS.find(
  (candidate) => candidate.owner === 'tier-c-prepared' && candidate.id === targetId,
);
if (!target) throw new Error('P1.12 Tier C spec received no target');

test(`${target.id} real interaction and retained evidence`, async ({ page }, testInfo) => {
  const theme = testInfo.project.metadata.p112Theme;
  if (theme !== 'light' && theme !== 'dark') throw new Error('P1.12 Tier C theme missing');
  const viewport = page.viewportSize();
  const capture = buildP112CapturePlan().find(
    (row) =>
      row.targetId === target.id &&
      row.theme === theme &&
      row.viewport.width === viewport?.width &&
      row.viewport.height === viewport.height,
  );
  if (!capture) throw new Error('P1.12 Tier C project is not in capture plan');
  const nonce = createHash('sha256').update(`${nonceSeed}:${capture.relativePath}`).digest('hex');
  await page
    .context()
    .addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: 'http://127.0.0.1:3001', sameSite: 'Lax' },
    ]);
  await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
  await installP112ProofBootstrap(page, target, nonce);
  let fixtureFactorId: string | undefined;
  const requestLedger = await installP112TierBRequestGuard(
    page,
    target.stateId,
    evidenceProfile,
    () => fixtureFactorId,
  );
  const secretStore = createSecretStore(path.resolve('.p1-12-acceptance-runtime'));
  const fixture = await secretStore.load();
  if (!fixture) throw new Error('P1.12 Tier C fixture manifest missing');
  const response = await prepareP112TierCState(page, target, fixture, secretStore, (factorId) => {
    fixtureFactorId = factorId;
  });
  await recordP112TierCHandoffCapture({
    page,
    capture,
    target,
    outputRoot,
    signingKey,
    nonce,
    response,
    requestLedger,
    runCommitment,
    forbiddenFixtureValues: [fixture.email, fixture.password, fixture.totpSecret ?? ''],
  });
});
