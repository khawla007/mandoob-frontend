import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildCapturePlan,
  buildEvidenceManifest,
  parityMarkdown,
  reconcileEvidence,
  type EvidenceManifest,
} from '../../scripts/p2-acceptance/evidence';

const evidenceRoot = resolve(
  process.cwd(),
  '../../../Reports/launch-gate-evidence/2026-09-07/dashboard-phase-2/p2-12-authenticated-desktop-acceptance',
);
const matrixPath = join(evidenceRoot, 'route-and-state-acceptance-matrix.md');
const repositoryRoot = resolve(process.cwd(), '../../..');

describe('P2.12 Tier B evidence', () => {
  it('derives the exact frozen role, theme, and viewport capture plan', async () => {
    const plan = buildCapturePlan(await readFile(matrixPath, 'utf8'));

    assert.equal(plan.length, 266);
    assert.deepEqual(
      Object.fromEntries(
        [...new Set(plan.map(({ logicalRole }) => logicalRole))].map((role) => [
          role,
          plan.filter(({ logicalRole }) => logicalRole === role).length,
        ]),
      ),
      { admin: 114, pro: 62, customer: 46, employee: 32, shared: 12 },
    );
    assert.deepEqual(
      Object.fromEntries(
        ['1440x900', '1536x1024', '1920x1080'].map((viewport) => [
          viewport,
          plan.filter(({ viewportLabel }) => viewportLabel === viewport).length,
        ]),
      ),
      { '1440x900': 212, '1536x1024': 8, '1920x1080': 46 },
    );
    assert.deepEqual(
      Object.fromEntries(
        ['light', 'dark'].map((theme) => [
          theme,
          plan.filter((capture) => capture.theme === theme).length,
        ]),
      ),
      { light: 133, dark: 133 },
    );
  });

  it('reconciles every planned PNG and verifies the four authoritative hashes', async () => {
    const manifest = await buildEvidenceManifest({ evidenceRoot, matrixPath, repositoryRoot });
    const result = await reconcileEvidence({ evidenceRoot, manifest });

    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.equal(result.expected, 266);
    assert.equal(result.actual, 266);
    assert.equal(result.manifest, 266);
    assert.equal(result.referencesVerified, 4);
    assert.equal(result.integrityFailures, 0);
    assert.equal(result.dimensionFailures, 0);
    assert.equal(result.privacyFailures, 0);
    assert.equal(
      manifest.captures.find(
        ({ routeNumber, theme, viewportLabel }) =>
          routeNumber === 49 && theme === 'dark' && viewportLabel === '1536x1024',
      )?.visualDecision,
      'reviewed-pass-dark-priority-action-cards-use-contrast-verified-semantic-surfaces',
    );
    for (const [routes, review] of [
      [[11, 30], 'reviewed-expected-legacy-pro-firms-list-redirect-to-canonical-admin-companies'],
      [
        [12, 31],
        'reviewed-expected-legacy-pro-firms-new-redirect-to-canonical-admin-companies-new',
      ],
    ] as const) {
      const captures = manifest.captures.filter(
        ({ routeNumber, duplicateReview }) =>
          (routes as readonly number[]).includes(routeNumber) && duplicateReview,
      );
      assert.ok(captures.length > 0, `expected duplicate captures for ${routes.join('/')}`);
      assert.equal(
        captures.every(({ duplicateReview }) => duplicateReview === review),
        true,
      );
    }
    assert.equal(
      manifest.captures.every(({ deviceScaleFactor }) => deviceScaleFactor === 1),
      true,
    );
    assert.equal(
      manifest.captures.every(
        ({ captureTimestampUtc, sha256 }) =>
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(captureTimestampUtc) &&
          /^[a-f0-9]{64}$/u.test(sha256),
      ),
      true,
    );
    assert.doesNotMatch(
      JSON.stringify(manifest),
      /@[a-z0-9.-]+|eyJ|service_role|[0-9a-f]{8}-[0-9a-f-]{27,}/iu,
    );
    const markdown = parityMarkdown(manifest, result);
    assert.match(markdown, /Tier B visual acceptance are \*\*GREEN\*\*/u);
    assert.match(markdown, /Expected compatibility redirects/u);
    assert.doesNotMatch(markdown, /\*\*Blocker/u);
  });

  it('detects missing, unplanned, and stale-hash captures', async () => {
    const manifest = await buildEvidenceManifest({ evidenceRoot, matrixPath, repositoryRoot });
    const sample = manifest.captures[0]!;
    const tempRoot = await mkdtemp(join(tmpdir(), 'p2-12-evidence-'));
    const sampleTarget = join(tempRoot, sample.file);
    await mkdir(dirname(sampleTarget), { recursive: true });
    await copyFile(join(evidenceRoot, sample.file), sampleTarget);

    const oneCaptureManifest: EvidenceManifest = { ...manifest, captures: [sample] };
    assert.equal(
      (await reconcileEvidence({ evidenceRoot: tempRoot, manifest: oneCaptureManifest })).ok,
      true,
    );

    await writeFile(join(tempRoot, 'screenshots/unplanned.png'), 'not a png');
    let result = await reconcileEvidence({ evidenceRoot: tempRoot, manifest: oneCaptureManifest });
    assert.equal(result.ok, false);
    assert.equal(result.unplannedFiles, 1);

    await writeFile(sampleTarget, Buffer.from('tampered'));
    result = await reconcileEvidence({ evidenceRoot: tempRoot, manifest: oneCaptureManifest });
    assert.equal(result.ok, false);
    assert.equal(result.staleHashes, 1);
    assert.equal(result.integrityFailures, 1);
  });
});
