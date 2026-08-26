import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CANONICAL_DOC_PATHS,
  MANIFEST_RELATIVE_PATH,
  buildManifest,
  serializeManifest,
  verifyManifest,
} from './verify-step3-outer-manifest.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'step3-outer-manifest-'));
  for (const relativePath of CANONICAL_DOC_PATHS) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${relativePath}\n`, 'utf8');
  }
  const evidenceRoot = path.dirname(path.join(root, MANIFEST_RELATIVE_PATH));
  await mkdir(path.join(evidenceRoot, 'hashes'), { recursive: true });
  await mkdir(path.join(evidenceRoot, 'screenshots'), { recursive: true });
  await writeFile(path.join(evidenceRoot, 'verification.md'), 'verified\n', 'utf8');
  await writeFile(path.join(evidenceRoot, 'hashes/sha256sums.txt'), 'existing hash file\n', 'utf8');
  await writeFile(path.join(evidenceRoot, 'screenshots/example.png'), Buffer.from([0, 1, 2, 3]));
  return root;
}

test('manifest deterministically covers canonical docs and every retained evidence file except itself', async () => {
  const root = await fixture();
  const manifest = await buildManifest(root);
  const paths = manifest.files.map((entry) => entry.path);

  assert.deepEqual(
    paths,
    [...paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))),
  );
  assert.equal(paths.includes(MANIFEST_RELATIVE_PATH), false);
  assert.equal(paths.includes('docs/roadmap.md'), true);
  assert.equal(
    paths.includes(
      'Reports/launch-gate-evidence/2026-08-21/one-pro-one-company-step-3/hashes/sha256sums.txt',
    ),
    true,
  );
  assert.equal(
    paths.includes(
      'Reports/launch-gate-evidence/2026-08-21/one-pro-one-company-step-3/screenshots/example.png',
    ),
    true,
  );
  assert.equal(serializeManifest(manifest).endsWith('\n'), true);
  await verifyManifest(root, manifest);
});

test('verification rejects tampering and retained evidence omitted after manifest creation', async () => {
  const root = await fixture();
  const manifest = await buildManifest(root);
  const evidenceRoot = path.dirname(path.join(root, MANIFEST_RELATIVE_PATH));

  await writeFile(path.join(evidenceRoot, 'verification.md'), 'tampered\n', 'utf8');
  await assert.rejects(() => verifyManifest(root, manifest), /Digest mismatch/u);

  const refreshed = await buildManifest(root);
  await writeFile(path.join(evidenceRoot, 'late-file.md'), 'not manifested\n', 'utf8');
  await assert.rejects(() => verifyManifest(root, refreshed), /Manifest path set mismatch/u);
});

test('manifest rejects a canonical document symlink', async () => {
  const root = await fixture();
  const canonicalPath = path.join(root, 'docs/roadmap.md');
  const targetPath = path.join(root, 'roadmap-target.md');
  await writeFile(targetPath, 'redirected canonical content\n', 'utf8');
  await unlink(canonicalPath);
  await symlink(targetPath, canonicalPath);

  await assert.rejects(() => buildManifest(root), /Symlink is not allowed: docs\/roadmap\.md/u);
});
