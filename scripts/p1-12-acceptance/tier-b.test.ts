import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';

import type { P112TierBTarget } from './tier-b';
import { P112_TIER_A_RENDERED_CASES } from './tier-a-manifest';

let subject: typeof import('./tier-b') | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  subject = require('./tier-b') as typeof import('./tier-b');
} catch {
  // The first TDD run deliberately reaches this assertion with no implementation module.
}

test('freezes and verifies the exact immutable R01-R12 reference contract', async () => {
  assert.ok(subject, 'Tier B implementation module must exist');
  assert.equal(subject.P112_REFERENCES.length, 12);
  assert.deepEqual(
    subject.P112_REFERENCES.map(({ id }) => id),
    Array.from({ length: 12 }, (_, index) => `R${String(index + 1).padStart(2, '0')}`),
  );
  assert.deepEqual(
    subject.P112_REFERENCES.map(({ width, height }) => [width, height]),
    [
      [829, 1897],
      [869, 1810],
      [1018, 1544],
      [1005, 1565],
      [1024, 1536],
      [1024, 1536],
      [941, 1672],
      [864, 1821],
      [1536, 1024],
      [1536, 1024],
      [1196, 1315],
      [1144, 1375],
    ],
  );
  assert.equal(new Set(subject.P112_REFERENCES.map(({ sourcePath }) => sourcePath)).size, 12);
  assert.ok(subject.P112_REFERENCES.every(({ sha256 }) => /^[a-f0-9]{64}$/u.test(sha256)));

  const repositoryRoot = path.resolve(process.cwd(), '../../..');
  const verified = await subject.verifyP112ReferenceFiles(repositoryRoot);
  assert.equal(verified.length, 12);
  assert.ok(verified.every(({ verified: result }) => result));
  assert.deepEqual(subject.P112_REFERENCES.find(({ id }) => id === 'R06')?.primaryStates, [
    'S018',
    'S019',
    'S021',
  ]);
  assert.deepEqual(subject.P112_REFERENCES.find(({ id }) => id === 'R09')?.primaryStates, [
    'S061',
    'S063',
  ]);
});

test('declares all structural review criteria and never claims closest-pattern pixel similarity', () => {
  assert.ok(subject, 'Tier B implementation module must exist');
  assert.deepEqual(subject.P112_PARITY_CRITERIA, [
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
  ]);
  assert.ok(subject.P112_TIER_B_TARGETS.some(({ family }) => family === 'pricing'));
  assert.ok(subject.P112_TIER_B_TARGETS.some(({ family }) => family === 'pro'));
  for (const family of [
    'authority-detail',
    'blog-detail',
    'knowledge-base-detail',
    'legal-privacy',
    'legal-terms',
    'legal-pdpl',
    'legal-trust',
    'generic-cms',
  ]) {
    const matched: P112TierBTarget | undefined = subject.P112_TIER_B_TARGETS.find(
      (candidate) => candidate.family === family,
    );
    assert.equal(matched?.reference.kind, 'closest-pattern', family);
    assert.equal(matched?.comparisonMethod, 'structural-review', family);
  }
  assert.ok(
    subject.P112_TIER_B_TARGETS.every(
      ({ comparisonMethod }) => comparisonMethod === 'structural-review',
    ),
  );
  assert.ok(
    subject.P112_TIER_B_TARGETS.every(({ pixelSimilarityClaim }) => pixelSimilarityClaim === false),
  );
  assert.deepEqual(subject.P112_PARITY_REJECTIONS, [
    'missing-or-reordered-required-sections',
    'materially-reduced-density',
    'generic-card-grid-replaces-reference-hierarchy',
    'materially-redesigned-form-workspace-table-summary-or-cta',
    'weakened-homepage-hero-or-final-get-started',
    'fabricated-content-or-action-for-similarity',
    'page-local-colors-fonts-or-inconsistent-shell',
    'multi-company-or-team-language',
    'clipped-illegible-light-only-or-dark-only-content',
  ]);
  assert.deepEqual(
    subject.P112_TIER_B_TARGETS.find(({ id }) => id === 'home-ready')?.requiredPreservations,
    ['accepted-homepage-hero', '07-get-started'],
  );
});

test('covers exact mapped and representative states with the required desktop capture matrix', () => {
  assert.ok(subject, 'Tier B implementation module must exist');
  const states = new Set(subject.P112_TIER_B_TARGETS.map(({ stateId }) => stateId));
  for (const stateId of [
    'S007',
    'S008',
    'S009',
    'S011',
    'S013',
    'S017',
    'S018',
    'S019',
    'S021',
    'S027',
    'S030',
    'S031',
    'S033',
    'S042',
    'S052',
    'S056',
    'S061',
    'S063',
    'S073',
    'S077',
    'S078',
    'S079',
    'S081',
    'S083',
    'S085',
    'S091',
    'S128',
    'S138',
    'S142',
  ] as const) {
    assert.ok(states.has(stateId), stateId);
  }
  assert.ok(subject.P112_TIER_B_TARGETS.every(({ route }) => route.startsWith('/')));
  assert.ok(subject.P112_TIER_B_TARGETS.every(({ stateId }) => /^S\d{3}$/u.test(stateId)));
  assert.ok(subject.P112_TIER_B_TARGETS.every(({ locale, dsf }) => locale === 'en' && dsf === 1));
  assert.equal(
    new Set(subject.P112_TIER_B_TARGETS.map(({ id }) => id)).size,
    subject.P112_TIER_B_TARGETS.length,
  );
  for (const reference of subject.P112_REFERENCES) {
    for (const stateId of reference.primaryStates) {
      assert.ok(
        subject.P112_TIER_B_TARGETS.some(
          (target) =>
            target.route === reference.routeByState[stateId] &&
            target.stateId === stateId &&
            target.reference.kind === 'exact' &&
            target.reference.id === reference.id,
        ),
        `${reference.id}:${stateId}`,
      );
    }
  }
  assert.equal(
    subject.P112_TIER_B_TARGETS.find(({ stateId }) => stateId === 'S033')?.route,
    '/knowledge-base?q=p1-12-no-match',
  );
  assert.equal(
    subject.P112_TIER_B_TARGETS.find(({ stateId }) => stateId === 'S077')?.reference.kind,
    'closest-pattern',
  );
  assert.equal(subject.P112_TIER_B_TARGETS.find(({ stateId }) => stateId === 'S142')?.route, '/');
  for (const target of subject.P112_TIER_B_TARGETS.filter(
    ({ owner }) => owner === 'tier-b-direct',
  )) {
    assert.ok(
      P112_TIER_A_RENDERED_CASES.some(
        ({ stateId, path }) => stateId === target.stateId && path === target.route,
      ),
      `${target.id} must reuse an exact Tier A rendered state`,
    );
  }
  for (const stateId of ['S027', 'S030', 'S033', 'S056'] as const) {
    assert.equal(
      subject.P112_TIER_B_TARGETS.find((target) => target.stateId === stateId)?.owner,
      'tier-b-direct',
      `${stateId} already has an exact Tier A render`,
    );
  }

  const plan = subject.buildP112CapturePlan();
  for (const target of subject.P112_TIER_B_TARGETS) {
    const targetRows = plan.filter(({ targetId }) => targetId === target.id);
    assert.deepEqual(
      targetRows
        .map(({ theme, viewport }) => `${theme}:${viewport.width}x${viewport.height}`)
        .sort(),
      [
        'dark:1280x800',
        'dark:1440x900',
        'light:1280x800',
        'light:1440x900',
        ...(target.family === 'application' ? ['dark:1536x1024', 'light:1536x1024'] : []),
      ].sort(),
      target.id,
    );
    assert.ok(targetRows.every(({ fullPage, dsf }) => fullPage && dsf === 1));
    assert.equal(
      new Set(targetRows.map(({ relativePath }) => relativePath)).size,
      targetRows.length,
    );
    assert.ok(
      targetRows.every(({ relativePath }) =>
        /^screenshots\/[a-z0-9-]+\/(light|dark)\/(1280x800|1440x900|1536x1024)\/S\d{3}\.png$/u.test(
          relativePath,
        ),
      ),
    );
  }
});

test('blocks secret-bearing MFA states and permits only reviewed secret-safe MFA captures', () => {
  assert.ok(subject, 'Tier B implementation module must exist');
  assert.deepEqual(subject.P112_NEVER_CAPTURE_STATE_IDS, ['S140', 'S141']);
  const mfa = subject.P112_TIER_B_TARGETS.filter(({ family }) => family.startsWith('mfa-'));
  assert.deepEqual(mfa.map(({ stateId }) => stateId).sort(), ['S128', 'S138', 'S142']);
  assert.ok(mfa.every(({ privacyClass }) => privacyClass === 'secret-safe-mfa'));
  assert.throws(
    () =>
      subject.assertP112CapturePrivacy({ stateId: 'S140', visibleText: '', visibleSelectors: [] }),
    /secret-bearing MFA state/u,
  );
  assert.throws(
    () =>
      subject.assertP112CapturePrivacy({
        stateId: 'S138',
        visibleText: 'otpauth://totp/example?secret=unsafe',
        visibleSelectors: [],
      }),
    /secret-bearing content/u,
  );
  assert.throws(
    () =>
      subject.assertP112CapturePrivacy({
        stateId: 'S138',
        visibleText: '',
        visibleSelectors: ['[data-testid="mfa-qr-code"]'],
      }),
    /secret-bearing surface/u,
  );
  for (const visibleText of [
    'Ashish Khawla',
    '+971 50 123 4567',
    'record 123e4567-e89b-12d3-a456-426614174000',
    '/run/media/private/session.json',
    'Postgres SQLSTATE 42P01 relation users does not exist',
  ]) {
    assert.throws(
      () =>
        subject.assertP112CapturePrivacy({
          stateId: 'S138',
          visibleText,
          visibleSelectors: [],
          forbiddenFixtureValues: ['Ashish Khawla'],
        }),
      /P1\.12/u,
      visibleText,
    );
  }
});

test('privacy control-data scanning does not join unrelated values across lines', () => {
  assert.ok(subject, 'Tier B implementation module must exist');
  assert.doesNotThrow(() =>
    subject.assertP112CapturePrivacy({
      stateId: 'S038',
      visibleText: 'Contact security@mandoob.ae for current information.',
      visibleSelectors: [],
    }),
  );
  assert.doesNotThrow(() =>
    subject.assertP112CapturePrivacy({
      stateId: 'S011',
      visibleText:
        'name:search=p1-12-no-match\nname:sort=name\nname:message=Synthetic local preview only',
      visibleSelectors: [],
    }),
  );
  assert.throws(
    () =>
      subject.assertP112CapturePrivacy({
        stateId: 'S138',
        visibleText: 'name:full-name=Fixture Person',
        visibleSelectors: [],
      }),
    /secret-bearing content/u,
  );
  assert.doesNotThrow(() =>
    subject.assertP112CapturePrivacy({
      stateId: 'S079',
      visibleText:
        'placeholder:name@example.com\nplaceholder:you@company.com\nplaceholder:+971501234567\npassword:\nname:password=\nplaceholder:Enter password',
      visibleSelectors: [],
    }),
  );
  assert.throws(
    () =>
      subject.assertP112CapturePrivacy({
        stateId: 'S079',
        visibleText: 'private@customer-domain.ae',
        visibleSelectors: [],
      }),
    /secret-bearing content/u,
  );
  assert.throws(
    () =>
      subject.assertP112CapturePrivacy({
        stateId: 'S079',
        visibleText: 'password:retained-value',
        visibleSelectors: [],
      }),
    /secret-bearing content/u,
  );
});

test('reconciles manifest rows, sha256sums, openable PNG dimensions, and the frozen plan', async () => {
  assert.ok(subject, 'Tier B implementation module must exist');
  const root = await mkdtemp(path.join(tmpdir(), 'p112-tier-b-'));
  const capture = subject.buildP112CapturePlan()[0]!;
  const absolute = path.join(root, capture.relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const png = makePng(1440, 2200);
  await writeFile(absolute, png);
  const sha256 = createHash('sha256').update(png).digest('hex');
  const target = subject.P112_TIER_B_TARGETS.find(({ id }) => id === capture.targetId)!;
  const preparation = subject.createP112CapturePreparationProof({
    target,
    preparedBy: target.owner,
    preparedAt: '2026-09-09T00:00:00.000Z',
    source: 'tier-a-route:S007',
    nonce: 'b'.repeat(32),
    signingKey: 'a'.repeat(64),
    observations: {
      responseStatus: 200,
      finalUrl: 'http://127.0.0.1:3001/',
      stateSelectors: [{ selector: '.hero', count: 1, visibleCount: 1 }],
      enabledControlCount: 4,
      documentStatus: 'complete',
    },
  });
  const row = subject.createP112ScreenshotManifestRow({
    capture,
    fullPageWidth: 1440,
    fullPageHeight: 2200,
    fixtureAlias: 'home-ready',
    timestamp: '2026-09-09T00:00:00.000Z',
    privacyReview: {
      reviewer: 'release-reviewer',
      result: 'pass',
      tools: ['dom-text-scan', 'visual-review', 'browser-page-screenshot'],
    },
    decisionSummary: 'Structural review accepted.',
    reviewedPath: capture.relativePath,
    reviewedSha256: sha256,
    reviewedAt: '2026-09-09T00:01:00.000Z',
    criteria: Object.fromEntries(
      subject.P112_PARITY_CRITERIA.map((criterion) => [criterion, { decision: 'pass' }]),
    ),
    comparisonScaling: '1:1-css-pixel',
    imageDecode: { engine: 'chromium', result: 'pass', width: 1440, height: 2200 },
    preparation,
    sha256,
  });
  assert.equal(row.pixelSimilarityClaim, false);
  assert.equal(row.privacy.reviewer, 'release-reviewer');
  assert.equal(row.comparisonScaling, '1:1-css-pixel');
  assert.equal(row.decision.reviewedSha256, sha256);
  assert.throws(
    () =>
      subject.createP112ScreenshotManifestRow({
        capture,
        fullPageWidth: 1440,
        fullPageHeight: 2200,
        fixtureAlias: 'home-ready',
        timestamp: '2026-09-09T00:00:00.000Z',
        privacyReview: row.privacy,
        decisionSummary: row.decision.summary,
        reviewedPath: capture.relativePath,
        reviewedSha256: sha256,
        reviewedAt: '2026-09-08T23:59:59.000Z',
        criteria: row.decision.criteria,
        comparisonScaling: '1:1-css-pixel',
        imageDecode: row.imageDecode,
        preparation,
        sha256,
      }),
    /after the provisional capture/u,
  );
  assert.deepEqual(row.imageDecode, {
    engine: 'chromium',
    result: 'pass',
    width: 1440,
    height: 2200,
  });
  const result = await subject.reconcileP112ScreenshotEvidence({
    screenshotRoot: root,
    rows: [row],
    plannedCaptures: [capture],
    sha256sums: `${'1'.repeat(64)}  verification.md\n${sha256}  ${capture.relativePath}\n`,
  });
  assert.deepEqual(result, { manifestRows: 1, pngFiles: 1, hashRows: 1 });
  assert.equal((await readFile(absolute)).subarray(1, 4).toString('ascii'), 'PNG');

  await assert.rejects(
    subject.reconcileP112ScreenshotEvidence({
      screenshotRoot: root,
      rows: [
        {
          ...row,
          sha256: '0'.repeat(64),
          decision: { ...row.decision, reviewedSha256: '0'.repeat(64) },
        },
      ],
      plannedCaptures: [capture],
      sha256sums: `${'1'.repeat(64)}  verification.md\n${sha256}  ${capture.relativePath}\n`,
    }),
    /SHA-256/u,
  );
  await assert.rejects(
    subject.reconcileP112ScreenshotEvidence({
      screenshotRoot: root,
      rows: [
        {
          ...row,
          decision: { ...row.decision, reviewedSha256: '0'.repeat(64) },
        },
      ],
      plannedCaptures: [capture],
      sha256sums: `${sha256}  ${capture.relativePath}\n`,
    }),
    /reviewed SHA|manifest identity/u,
  );
  assert.throws(
    () =>
      subject.createP112ScreenshotManifestRow({
        capture,
        fullPageWidth: 1440,
        fullPageHeight: 2200,
        fixtureAlias: 'wrong-fixture',
        timestamp: '2026-09-09T00:00:00.000Z',
        privacyReview: {
          reviewer: '',
          result: 'pass',
          tools: ['dom-text-scan', 'visual-review', 'browser-page-screenshot'],
        },
        decisionSummary: '',
        reviewedPath: capture.relativePath,
        reviewedSha256: sha256,
        reviewedAt: '2026-09-09T00:01:00.000Z',
        criteria: Object.fromEntries(
          subject.P112_PARITY_CRITERIA.map((criterion) => [
            criterion,
            { decision: criterion === 'footer-handoff' ? 'deliberate-difference' : 'pass' },
          ]),
        ),
        comparisonScaling: '1:1-css-pixel',
        imageDecode: { engine: 'chromium', result: 'pass', width: 1440, height: 2200 },
        preparation,
        sha256,
      }),
    /fixture|reviewer|summary|rationale/u,
  );
});

test('generates a local side-by-side review artifact without external resources or similarity metrics', () => {
  assert.ok(subject, 'Tier B implementation module must exist');
  const repositoryRoot = path.resolve(process.cwd(), '../../..');
  const closestTargets = subject.P112_TIER_B_TARGETS.filter(
    ({ reference }) => reference.kind === 'closest-pattern',
  );
  for (const candidate of closestTargets) {
    assert.equal(candidate.reference.kind, 'closest-pattern');
    assert.match(candidate.reference.sourceEvidence.path, /^Reports\/launch-gate-evidence\//u);
    assert.match(candidate.reference.sourceEvidence.version, /^P1\.(?:04|06|07|08|09|10|11)@/u);
    assert.ok(candidate.reference.sourceEvidence.section.trim().length > 0);
    assert.ok(existsSync(path.join(repositoryRoot, candidate.reference.sourceEvidence.path)));
  }
  const target = subject.P112_TIER_B_TARGETS.find(({ id }) => id === 'pricing-ready')!;
  assert.equal(target.reference.kind, 'closest-pattern');
  const html = subject.renderP112SideBySideReviewHtml([
    {
      target,
      candidatePath: `screenshots/${target.family}/light/1440x900/${target.stateId}.png`,
      referencePaths: target.reference.ids.map((id) => `reference-review/${id}.png`),
    },
  ]);
  assert.match(html, /<!doctype html>/iu);
  assert.match(html, /Structural closest-pattern review/iu);
  assert.doesNotMatch(html, /https?:\/\//iu);
  assert.doesNotMatch(html, /pixel similarity|similarity score/iu);
  assert.equal((html.match(/reference-review\/R03\.png/gu) ?? []).length, 1);
  assert.equal((html.match(/reference-review\/R05\.png/gu) ?? []).length, 1);
});

test('binds a nonsecret run id to accepted and candidate revisions without persisting its key', () => {
  assert.ok(subject);
  const key = 'a'.repeat(64);
  const identity = subject.createP112RunCommitment({
    runId: 'p112-run-20260909-a1',
    acceptedBaseSha: subject.P112_ACCEPTED_BASE_SHA,
    candidateSha: 'e'.repeat(64),
    candidateDigest: 'c'.repeat(64),
    candidateDescendsFromAcceptedBase: true,
    signingKey: key,
  });
  assert.equal('signingKey' in identity, false);
  subject.validateP112RunCommitment(identity, key);
  assert.throws(
    () => subject.validateP112RunCommitment({ ...identity, candidateDigest: 'd'.repeat(64) }, key),
    /commitment/u,
  );
  assert.throws(
    () =>
      subject.createP112RunCommitment({
        runId: 'p112-wrong-base',
        acceptedBaseSha: 'b'.repeat(40),
        candidateSha: 'c'.repeat(40),
        candidateDigest: 'd'.repeat(64),
        candidateDescendsFromAcceptedBase: true,
        signingKey: key,
      }),
    /accepted base/u,
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
