import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';

import {
  P112_PARITY_CRITERIA,
  createP112RunCommitment,
  type P112Capture,
  type P112CriterionReview,
  type P112ParityCriterion,
  type P112TierBTarget,
} from './tier-b';
import { P112_TIER_A_RENDERED_CASES } from './tier-a-manifest';

let subject: typeof import('./tier-b-runner') | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  subject = require('./tier-b-runner') as typeof import('./tier-b-runner');
} catch {
  // The first TDD run deliberately reaches this assertion with no runner module.
}

test('executes ownership-isolated capture shards and refuses incomplete final evidence', async () => {
  assert.ok(subject, 'Tier B runner implementation module must exist');
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'p112-tier-b-runner-'));
  const runSigningKey = 'f'.repeat(64);
  const runCommitment = createP112RunCommitment({
    runId: 'p112-test-runner',
    acceptedBaseSha: '6995abccd0986127f11b8e0751c54fe913584da7',
    candidateSha: 'b'.repeat(40),
    candidateDigest: 'c'.repeat(64),
    candidateDescendsFromAcceptedBase: true,
    signingKey: runSigningKey,
  });
  const repositoryRoot = path.resolve(process.cwd(), '../../..');
  const review = {
    privacyReview: {
      reviewer: 'release-reviewer',
      result: 'pass' as const,
      tools: ['dom-text-scan', 'visual-review', 'browser-page-screenshot'] as const,
    },
    decisionSummary: 'Reviewed against the immutable structural contract.',
    criteria: Object.fromEntries(
      P112_PARITY_CRITERIA.map((criterion) => [criterion, { decision: 'pass' as const }]),
    ) as Record<P112ParityCriterion, P112CriterionReview>,
    comparisonScaling: '1:1-css-pixel' as const,
    reviewedAt: '2026-09-09T00:01:00.000Z',
  };
  const prepare = async (target: P112TierBTarget, capture: P112Capture) => {
    const height = capture.viewport.height + 100;
    const png = makePng(capture.viewport.width, height);
    const signingKey = runSigningKey;
    const nonce = createHash('sha256').update(capture.relativePath).digest('hex').slice(0, 32);
    const rendered = P112_TIER_A_RENDERED_CASES.find(
      ({ stateId, path: route }) => stateId === target.stateId && route === target.route,
    );
    const responseStatus = rendered?.expectedStatus ?? 200;
    const proof = subject.createP112CapturePreparationProof({
      target,
      preparedBy: target.owner,
      preparedAt: '2026-09-09T00:00:00.000Z',
      source:
        target.owner === 'tier-b-direct'
          ? `tier-a-route:${target.stateId}`
          : `tier-c-journey:${target.stateId}`,
      nonce,
      signingKey,
      observations: {
        responseStatus,
        finalUrl: new URL(target.route, 'http://127.0.0.1:3001').href,
        stateSelectors: [
          { selector: `[data-test-state="${target.stateId}"]`, count: 1, visibleCount: 1 },
        ],
        enabledControlCount: 1,
        documentStatus: 'complete',
      },
    });
    return {
      proof,
      forbiddenFixtureValues: [],
      page: {
        url: () => new URL(target.route, 'http://127.0.0.1:3001').href,
        viewportSize: () => capture.viewport,
        waitForLoadState: async () => undefined,
        evaluate: async (_callback: unknown, argument?: unknown) =>
          typeof argument === 'string'
            ? { width: capture.viewport.width, height }
            : {
                deviceScaleFactor: 1,
                language: 'en',
                direction: 'ltr',
                theme: capture.theme,
                visibleText: 'Safe public acceptance copy',
                visibleSecretSelectors: [],
                brokenImages: [],
                browserStateMarker: {
                  stateId: target.stateId,
                  fixtureAlias: target.fixtureAlias,
                  nonce: proof.nonce,
                  signature: proof.signature,
                },
                visibleControlData: [],
                stateObservations: proof.observations,
              },
        screenshot: async () => png,
      },
      signingKey,
    };
  };

  const direct = await subject.executeP112TierBShard({
    owner: 'tier-b-direct',
    outputRoot,
    repositoryRoot,
    prepare,
    review: async (_target, capture, result) => ({
      ...review,
      reviewedPath: capture.relativePath,
      reviewedSha256: result.sha256,
    }),
    now: () => '2026-09-09T00:00:00.000Z',
    runCommitment,
    signingKey: runSigningKey,
  });
  assert.ok(direct.rows.length > 0);
  assert.ok(direct.rows.every(({ preparation }) => preparation.preparedBy === 'tier-b-direct'));
  assert.match(
    await readFile(path.join(outputRoot, 'tier-b-direct.manifest.json'), 'utf8'),
    /"state"/u,
  );
  assert.match(
    await readFile(path.join(outputRoot, 'tier-b-direct.sha256sums.txt'), 'utf8'),
    /screenshots\//u,
  );
  assert.match(
    await readFile(path.join(outputRoot, 'tier-b-direct.review.html'), 'utf8'),
    /structural review/iu,
  );
  await assert.rejects(
    subject.finalizeP112TierBEvidence({ outputRoot, signingKey: runSigningKey }),
    /incomplete|tier-c-prepared/u,
  );

  const tierC = await subject.executeP112TierBShard({
    owner: 'tier-c-prepared',
    outputRoot,
    repositoryRoot,
    prepare,
    review: async (_target, capture, result) => ({
      ...review,
      reviewedPath: capture.relativePath,
      reviewedSha256: result.sha256,
    }),
    now: () => '2026-09-09T00:00:00.000Z',
    runCommitment,
    signingKey: runSigningKey,
  });
  assert.ok(tierC.rows.length > 0);
  assert.ok(tierC.rows.every(({ preparation }) => preparation.preparedBy === 'tier-c-prepared'));
  const final = await subject.finalizeP112TierBEvidence({ outputRoot, signingKey: runSigningKey });
  assert.equal(final.manifestRows, direct.rows.length + tierC.rows.length);
  assert.equal(final.pngFiles, final.manifestRows);
  assert.equal(final.hashRows, final.manifestRows);
  assert.match(
    await readFile(path.join(outputRoot, 'screenshot-manifest.json'), 'utf8'),
    /"acceptedBaseSha": "6995abccd0986127f11b8e0751c54fe913584da7"/u,
  );
  assert.match(
    await readFile(path.join(outputRoot, 'side-by-side-review.html'), 'utf8'),
    /1:1 CSS pixels/iu,
  );
});

test('rejects a preparation provider that claims the wrong ownership or incomplete state proof', async () => {
  assert.ok(subject, 'Tier B runner implementation module must exist');
  const target = subject.getP112TierBTargetsForOwner('tier-b-direct')[0]!;
  assert.throws(
    () =>
      subject.createP112CapturePreparationProof({
        target,
        preparedBy: 'tier-c-prepared',
        preparedAt: '2026-09-09T00:00:00.000Z',
        source: '',
        nonce: 'b'.repeat(32),
        signingKey: 'a'.repeat(64),
        observations: {
          responseStatus: 200,
          finalUrl: 'http://127.0.0.1:3001/',
          stateSelectors: [],
          enabledControlCount: 0,
          documentStatus: 'loading' as never,
        },
      }),
    /owner|source|checks/u,
  );
});

function makePng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanline = Buffer.alloc(width * 4 + 1);
  const image = Buffer.concat(Array.from({ length: height }, () => scanline));
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(image)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  body.copy(result, 4);
  result.writeUInt32BE(crc32(body), data.length + 8);
  return result;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
