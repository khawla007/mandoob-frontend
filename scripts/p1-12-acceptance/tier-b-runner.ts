import { mkdir, readFile } from 'node:fs/promises';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

import {
  buildP112CapturePlan,
  createP112ScreenshotManifestRow,
  P112_REFERENCES,
  P112_TIER_B_TARGETS,
  reconcileP112ScreenshotEvidence,
  renderP112SideBySideReviewHtml,
  validateP112RunCommitment,
  validateP112CapturePreparationProof,
  verifyP112ReferenceFiles,
  type P112Capture,
  type P112CapturePreparationProof,
  type P112CriterionReview,
  type P112ParityCriterion,
  type P112PrivacyReview,
  type P112ScreenshotManifestRow,
  type P112TierBTarget,
  type P112RunCommitment,
} from './tier-b';
import { captureP112Screenshot, type P112CapturePage } from './tier-b-capture';
import { assertP112NoSymlinkPath, writeP112AtomicPrivateFile } from './tier-b-fs';

export { createP112CapturePreparationProof } from './tier-b';

type CaptureOwner = P112TierBTarget['owner'];

type PreparedCapture = {
  page: P112CapturePage;
  proof: P112CapturePreparationProof;
  signingKey: string;
  /** Process-local fixture values used only to fail privacy scanning. Never persisted. */
  forbiddenFixtureValues: readonly string[];
};

type ReviewResult = {
  privacyReview: P112PrivacyReview;
  decisionSummary: string;
  criteria: Record<P112ParityCriterion, P112CriterionReview>;
  comparisonScaling: '1:1-css-pixel';
  reviewedAt: string;
  reviewedPath: string;
  reviewedSha256: string;
};

export type P112ProvisionalCapture = {
  capture: P112Capture;
  capturedAt: string;
  fixtureAlias: string;
  preparation: P112CapturePreparationProof;
  fullPageDimensions: { width: number; height: number };
  imageDecode: Awaited<ReturnType<typeof captureP112Screenshot>>['imageDecode'];
  sha256: string;
  requestLedger: {
    stateId: string;
    installed: true;
    allowed: readonly unknown[];
    rejected: readonly unknown[];
    failures: readonly unknown[];
    commitment: string;
  };
  runCommitment: P112RunCommitment;
};

export async function writeP112ProvisionalCaptureFragment(
  outputRoot: string,
  owner: CaptureOwner,
  record: P112ProvisionalCapture,
): Promise<void> {
  const target = P112_TIER_B_TARGETS.find(({ id }) => id === record.capture.targetId);
  if (
    !target ||
    target.owner !== owner ||
    record.fixtureAlias !== target.fixtureAlias ||
    record.requestLedger.stateId !== target.stateId ||
    record.requestLedger.rejected.length > 0 ||
    record.requestLedger.failures.length > 0
  ) {
    throw new Error('P1.12 provisional capture ownership/fixture mismatch');
  }
  const fragment = path.join(
    outputRoot,
    '.provisional',
    owner,
    `${record.capture.relativePath.replaceAll('/', '__')}.json`,
  );
  await mkdir(path.dirname(fragment), { recursive: true, mode: 0o700 });
  await writePrivateFile(fragment, `${JSON.stringify(record, null, 2)}\n`);
}

export function getP112TierBTargetsForOwner(owner: CaptureOwner): readonly P112TierBTarget[] {
  return P112_TIER_B_TARGETS.filter((target) => target.owner === owner);
}

export async function executeP112TierBShard(input: {
  owner: CaptureOwner;
  outputRoot: string;
  repositoryRoot: string;
  prepare(target: P112TierBTarget, capture: P112Capture): Promise<PreparedCapture>;
  review(
    target: P112TierBTarget,
    capture: P112Capture,
    result: Awaited<ReturnType<typeof captureP112Screenshot>>,
  ): Promise<ReviewResult>;
  now?: () => string;
  runCommitment: P112RunCommitment;
  signingKey: string;
}): Promise<{ owner: CaptureOwner; rows: readonly P112ScreenshotManifestRow[] }> {
  await verifyP112ReferenceFiles(input.repositoryRoot);
  validateP112RunCommitment(input.runCommitment, input.signingKey);
  const targets = getP112TierBTargetsForOwner(input.owner);
  const targetIds = new Set(targets.map(({ id }) => id));
  const captures = buildP112CapturePlan().filter(({ targetId }) => targetIds.has(targetId));
  if (captures.length === 0) throw new Error(`P1.12 ${input.owner} capture shard is empty`);
  const rows: P112ScreenshotManifestRow[] = [];

  for (const capture of captures) {
    const target = targets.find(({ id }) => id === capture.targetId)!;
    const prepared = await input.prepare(target, capture);
    validateP112CapturePreparationProof(prepared.proof, target, prepared.signingKey);
    const result = await captureP112Screenshot(prepared.page, capture, input.outputRoot, {
      proof: prepared.proof,
      signingKey: prepared.signingKey,
      forbiddenFixtureValues: prepared.forbiddenFixtureValues,
    });
    const review = await input.review(target, capture, result);
    if (review.reviewedPath !== capture.relativePath || review.reviewedSha256 !== result.sha256) {
      throw new Error('P1.12 review record is not bound to the retained PNG');
    }
    rows.push(
      createP112ScreenshotManifestRow({
        capture,
        fullPageWidth: result.fullPageDimensions.width,
        fullPageHeight: result.fullPageDimensions.height,
        fixtureAlias: prepared.proof.fixtureAlias,
        timestamp: input.now?.() ?? new Date().toISOString(),
        privacyReview: review.privacyReview,
        decisionSummary: review.decisionSummary,
        reviewedPath: review.reviewedPath,
        reviewedSha256: review.reviewedSha256,
        reviewedAt: review.reviewedAt,
        criteria: review.criteria,
        comparisonScaling: review.comparisonScaling,
        imageDecode: result.imageDecode,
        preparation: prepared.proof,
        sha256: result.sha256,
      }),
    );
  }

  if (rows.length !== captures.length) throw new Error(`P1.12 ${input.owner} evidence incomplete`);
  await writeShardArtifacts(
    input.outputRoot,
    input.repositoryRoot,
    input.owner,
    rows,
    input.runCommitment,
  );
  const sha256sums = buildSha256sums(rows);
  await reconcileP112ScreenshotEvidence({
    screenshotRoot: input.outputRoot,
    rows,
    plannedCaptures: captures,
    sha256sums,
    allowAdditionalPngs: true,
  });
  return { owner: input.owner, rows };
}

export async function finalizeP112TierBEvidence(input: {
  outputRoot: string;
  signingKey: string;
}): Promise<{ manifestRows: number; pngFiles: number; hashRows: number }> {
  const owners: readonly CaptureOwner[] = ['tier-b-direct', 'tier-c-prepared'];
  const rows: P112ScreenshotManifestRow[] = [];
  let acceptedRun: P112RunCommitment | undefined;
  for (const owner of owners) {
    let contents: string;
    try {
      const manifestPath = path.join(input.outputRoot, `${owner}.manifest.json`);
      await assertP112NoSymlinkPath(input.outputRoot, manifestPath);
      contents = await readFile(manifestPath, 'utf8');
    } catch {
      throw new Error(`P1.12 Tier B evidence incomplete: missing ${owner} shard`);
    }
    const shard = JSON.parse(contents) as {
      owner?: string;
      rows?: P112ScreenshotManifestRow[];
      runCommitment?: P112RunCommitment;
    };
    if (shard.owner !== owner || !Array.isArray(shard.rows)) {
      throw new Error(`P1.12 Tier B evidence incomplete: invalid ${owner} shard`);
    }
    if (shard.rows.some(({ preparation }) => preparation?.preparedBy !== owner)) {
      throw new Error(`P1.12 Tier B ${owner} shard contains foreign preparation claims`);
    }
    for (const row of shard.rows) {
      const target = P112_TIER_B_TARGETS.find(({ id }) => id === row.preparation.targetId);
      if (!target) throw new Error('P1.12 shard proof target missing');
      validateP112CapturePreparationProof(row.preparation, target, input.signingKey);
    }
    if (!shard.runCommitment) throw new Error('P1.12 shard run commitment missing');
    validateP112RunCommitment(shard.runCommitment, input.signingKey);
    if (acceptedRun && JSON.stringify(acceptedRun) !== JSON.stringify(shard.runCommitment))
      throw new Error('P1.12 mixed or stale run commitments');
    acceptedRun = shard.runCommitment;
    rows.push(...shard.rows);
  }

  const plan = buildP112CapturePlan();
  if (rows.length !== plan.length) throw new Error('P1.12 Tier B evidence incomplete');
  const sha256sums = buildSha256sums(rows);
  if (!acceptedRun) throw new Error('P1.12 verified run commitment missing');
  await writePrivateFile(
    path.join(input.outputRoot, 'screenshot-manifest.json'),
    `${JSON.stringify({ schemaVersion: 1, runCommitment: acceptedRun, rows }, null, 2)}\n`,
  );
  await writePrivateFile(path.join(input.outputRoot, 'screenshot-sha256sums.txt'), sha256sums);
  await writePrivateFile(
    path.join(input.outputRoot, 'side-by-side-review.html'),
    renderReview(rows),
  );
  return reconcileP112ScreenshotEvidence({
    screenshotRoot: input.outputRoot,
    rows,
    plannedCaptures: plan,
    sha256sums,
  });
}

export async function assembleP112TierBFragments(input: {
  owner: CaptureOwner;
  outputRoot: string;
  repositoryRoot: string;
}): Promise<{ owner: CaptureOwner; rows: readonly P112ScreenshotManifestRow[] }> {
  await verifyP112ReferenceFiles(input.repositoryRoot);
  const targetIds = new Set(getP112TierBTargetsForOwner(input.owner).map(({ id }) => id));
  const captures = buildP112CapturePlan().filter(({ targetId }) => targetIds.has(targetId));
  const rows: P112ScreenshotManifestRow[] = [];
  for (const capture of captures) {
    const fragment = path.join(
      input.outputRoot,
      '.fragments',
      input.owner,
      `${capture.relativePath.replaceAll('/', '__')}.json`,
    );
    try {
      rows.push(JSON.parse(await readFile(fragment, 'utf8')) as P112ScreenshotManifestRow);
    } catch {
      throw new Error(`P1.12 ${input.owner} evidence incomplete: missing ${capture.relativePath}`);
    }
  }
  await writeShardArtifacts(input.outputRoot, input.repositoryRoot, input.owner, rows);
  const sha256sums = buildSha256sums(rows);
  await reconcileP112ScreenshotEvidence({
    screenshotRoot: input.outputRoot,
    rows,
    plannedCaptures: captures,
    sha256sums,
    allowAdditionalPngs: true,
  });
  return { owner: input.owner, rows };
}

async function readProvisionalRecords(
  owner: CaptureOwner,
  outputRoot: string,
): Promise<P112ProvisionalCapture[]> {
  const targetIds = new Set(getP112TierBTargetsForOwner(owner).map(({ id }) => id));
  const captures = buildP112CapturePlan().filter(({ targetId }) => targetIds.has(targetId));
  const records: P112ProvisionalCapture[] = [];
  for (const capture of captures) {
    const file = path.join(
      outputRoot,
      '.provisional',
      owner,
      `${capture.relativePath.replaceAll('/', '__')}.json`,
    );
    let record: P112ProvisionalCapture;
    try {
      await assertP112NoSymlinkPath(outputRoot, file);
      record = JSON.parse(await readFile(file, 'utf8')) as P112ProvisionalCapture;
    } catch {
      throw new Error(`P1.12 ${owner} provisional evidence incomplete: ${capture.relativePath}`);
    }
    const screenshotPath = path.join(outputRoot, capture.relativePath);
    await assertP112NoSymlinkPath(outputRoot, screenshotPath);
    const bytes = await readFile(screenshotPath);
    const actualSha = createHash('sha256').update(bytes).digest('hex');
    if (
      record.capture.relativePath !== capture.relativePath ||
      record.sha256 !== actualSha ||
      record.imageDecode.result !== 'pass'
    ) {
      throw new Error(`P1.12 provisional PNG/hash drift: ${capture.relativePath}`);
    }
    records.push(record);
  }
  return records;
}

export async function assembleP112TierBProvisional(input: {
  owner: CaptureOwner;
  outputRoot: string;
  repositoryRoot: string;
}): Promise<{ owner: CaptureOwner; captures: number }> {
  await verifyP112ReferenceFiles(input.repositoryRoot);
  const records = await readProvisionalRecords(input.owner, input.outputRoot);
  await stageReferenceCopies(input.outputRoot, input.repositoryRoot);
  await writePrivateFile(
    path.join(input.outputRoot, `${input.owner}.provisional.json`),
    `${JSON.stringify({ schemaVersion: 1, owner: input.owner, records }, null, 2)}\n`,
  );
  await writePrivateFile(
    path.join(input.outputRoot, `${input.owner}.review.html`),
    renderP112SideBySideReviewHtml(
      records.map(({ capture }) => {
        const target = P112_TIER_B_TARGETS.find(({ id }) => id === capture.targetId)!;
        const ids =
          target.reference.kind === 'exact' ? [target.reference.id] : target.reference.ids;
        return {
          target,
          candidatePath: capture.relativePath,
          referencePaths: ids.map((id) => `reference-review/${id}.png`),
        };
      }),
    ),
  );
  return { owner: input.owner, captures: records.length };
}

export async function finalizeP112TierBShardReviews(input: {
  owner: CaptureOwner;
  outputRoot: string;
  repositoryRoot: string;
  reviewInput: string;
  signingKey: string;
}): Promise<{ owner: CaptureOwner; rows: readonly P112ScreenshotManifestRow[] }> {
  const records = await readProvisionalRecords(input.owner, input.outputRoot);
  const runCommitment = records[0]?.runCommitment;
  if (!runCommitment) throw new Error('P1.12 provisional run commitment missing');
  validateP112RunCommitment(runCommitment, input.signingKey);
  if (
    records.some((record) => JSON.stringify(record.runCommitment) !== JSON.stringify(runCommitment))
  )
    throw new Error('P1.12 mixed provisional run commitments');
  for (const record of records) {
    const { commitment, ...ledger } = record.requestLedger;
    const expected = createHmac('sha256', Buffer.from(input.signingKey, 'hex'))
      .update(JSON.stringify(ledger))
      .digest('hex');
    if (
      !/^[a-f0-9]{64}$/u.test(commitment) ||
      !timingSafeEqual(Buffer.from(commitment, 'hex'), Buffer.from(expected, 'hex'))
    )
      throw new Error('P1.12 request ledger commitment mismatch');
  }
  await assertP112NoSymlinkPath(path.dirname(input.reviewInput), input.reviewInput);
  const reviews = JSON.parse(await readFile(input.reviewInput, 'utf8')) as Record<
    string,
    ReviewResult & { reviewedPath: string; reviewedSha256: string }
  >;
  const rows = records.map((record) => {
    const target = P112_TIER_B_TARGETS.find(({ id }) => id === record.capture.targetId);
    if (!target) throw new Error('P1.12 provisional proof target missing');
    validateP112CapturePreparationProof(record.preparation, target, input.signingKey);
    const review = reviews[record.capture.relativePath];
    if (
      !review ||
      review.reviewedPath !== record.capture.relativePath ||
      review.reviewedSha256 !== record.sha256
    ) {
      throw new Error(`P1.12 exact PNG review binding missing: ${record.capture.relativePath}`);
    }
    return createP112ScreenshotManifestRow({
      capture: record.capture,
      fullPageWidth: record.fullPageDimensions.width,
      fullPageHeight: record.fullPageDimensions.height,
      fixtureAlias: record.fixtureAlias,
      timestamp: record.capturedAt,
      privacyReview: review.privacyReview,
      decisionSummary: review.decisionSummary,
      reviewedPath: review.reviewedPath,
      reviewedSha256: review.reviewedSha256,
      reviewedAt: review.reviewedAt,
      criteria: review.criteria,
      comparisonScaling: review.comparisonScaling,
      imageDecode: record.imageDecode,
      preparation: record.preparation,
      sha256: record.sha256,
    });
  });
  await writeShardArtifacts(
    input.outputRoot,
    input.repositoryRoot,
    input.owner,
    rows,
    runCommitment,
  );
  return { owner: input.owner, rows };
}

async function writeShardArtifacts(
  outputRoot: string,
  repositoryRoot: string,
  owner: CaptureOwner,
  rows: readonly P112ScreenshotManifestRow[],
  runCommitment?: P112RunCommitment,
): Promise<void> {
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  await stageReferenceCopies(outputRoot, repositoryRoot);
  await writePrivateFile(
    path.join(outputRoot, `${owner}.manifest.json`),
    `${JSON.stringify({ schemaVersion: 1, owner, runCommitment, rows }, null, 2)}\n`,
  );
  await writePrivateFile(path.join(outputRoot, `${owner}.sha256sums.txt`), buildSha256sums(rows));
  await writePrivateFile(path.join(outputRoot, `${owner}.review.html`), renderReview(rows));
}

async function stageReferenceCopies(outputRoot: string, repositoryRoot: string): Promise<void> {
  const destination = path.join(outputRoot, 'reference-review');
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const reference of P112_REFERENCES) {
    const source = path.join(repositoryRoot, reference.sourcePath);
    const target = path.join(destination, `${reference.id}.png`);
    await assertP112NoSymlinkPath(repositoryRoot, source);
    await writeP112AtomicPrivateFile(outputRoot, target, await readFile(source));
  }
}

function renderReview(rows: readonly P112ScreenshotManifestRow[]): string {
  return renderP112SideBySideReviewHtml(
    rows.map((row) => {
      const target = P112_TIER_B_TARGETS.find(({ id }) => id === row.preparation.targetId)!;
      const referenceIds =
        target.reference.kind === 'exact' ? [target.reference.id] : target.reference.ids;
      return {
        target,
        candidatePath: row.file,
        referencePaths: referenceIds.map((referenceId) => `reference-review/${referenceId}.png`),
      };
    }),
  );
}

function buildSha256sums(rows: readonly P112ScreenshotManifestRow[]): string {
  return [...rows]
    .sort((left, right) => left.file.localeCompare(right.file))
    .map(({ sha256, file }) => `${sha256}  ${file}`)
    .join('\n')
    .concat('\n');
}

async function writePrivateFile(file: string, contents: string): Promise<void> {
  await writeP112AtomicPrivateFile(path.dirname(file), file, contents);
}
