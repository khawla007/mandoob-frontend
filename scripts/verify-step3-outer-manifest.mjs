import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MANIFEST_RELATIVE_PATH =
  'Reports/launch-gate-evidence/2026-08-21/one-pro-one-company-step-3/outer-manifest.json';

const EVIDENCE_RELATIVE_ROOT = path.posix.dirname(MANIFEST_RELATIVE_PATH);

export const CANONICAL_DOC_PATHS = [
  'docs/backend/schema.md',
  'docs/documentation/api/companies.md',
  'docs/documentation/api/users.md',
  'docs/documentation/architecture/auth-architecture.md',
  'docs/documentation/architecture/db-relations.md',
  'docs/documentation/architecture/pro-lifecycle.md',
  'docs/documentation/architecture/system-overview.md',
  'docs/documentation/flows/pro-company-assignment-flow.md',
  'docs/documentation/flows/pro-onboarding-flow.md',
  'docs/documentation/roles/roles-permissions.md',
  'docs/roadmap.md',
];

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function absolutePath(root, relativePath) {
  return path.join(root, ...relativePath.split('/'));
}

async function evidencePaths(root) {
  const evidenceRoot = absolutePath(root, EVIDENCE_RELATIVE_ROOT);
  const found = [];

  async function walk(directory, relativeDirectory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareUtf8(left.name, right.name));
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const diskPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${relativePath}`);
      if (entry.isDirectory()) await walk(diskPath, relativePath);
      else if (entry.isFile() && relativePath !== MANIFEST_RELATIVE_PATH) found.push(relativePath);
    }
  }

  await walk(evidenceRoot, EVIDENCE_RELATIVE_ROOT);
  return found;
}

async function sha256(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

export async function buildManifest(root) {
  const resolvedRoot = path.resolve(root);
  for (const relativePath of CANONICAL_DOC_PATHS) {
    if ((await lstat(absolutePath(resolvedRoot, relativePath))).isSymbolicLink()) {
      throw new Error(`Symlink is not allowed: ${relativePath}`);
    }
  }
  const paths = [...CANONICAL_DOC_PATHS, ...(await evidencePaths(resolvedRoot))].sort(compareUtf8);
  if (new Set(paths).size !== paths.length) throw new Error('Manifest paths are duplicated');
  const files = await Promise.all(
    paths.map(async (relativePath) => ({
      path: relativePath,
      sha256: await sha256(absolutePath(resolvedRoot, relativePath)),
    })),
  );
  return {
    schemaVersion: 1,
    algorithm: 'sha256',
    ordering: 'relative paths sorted by unsigned UTF-8 bytes',
    root: 'Mandoob workspace root supplied at verification time',
    excluded: [MANIFEST_RELATIVE_PATH],
    files,
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function assertManifestShape(manifest) {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.algorithm !== 'sha256' ||
    manifest?.ordering !== 'relative paths sorted by unsigned UTF-8 bytes' ||
    manifest?.root !== 'Mandoob workspace root supplied at verification time' ||
    JSON.stringify(manifest?.excluded) !== JSON.stringify([MANIFEST_RELATIVE_PATH]) ||
    !Array.isArray(manifest?.files)
  ) {
    throw new Error('Manifest metadata is invalid');
  }
  const paths = manifest.files.map((entry) => {
    if (
      !entry ||
      typeof entry.path !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
      entry.path.startsWith('/') ||
      entry.path.includes('\\') ||
      entry.path.split('/').includes('..')
    ) {
      throw new Error('Manifest entry is invalid');
    }
    return entry.path;
  });
  const sorted = [...paths].sort(compareUtf8);
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify(sorted)) {
    throw new Error('Manifest paths are duplicated or unordered');
  }
}

export async function verifyManifest(root, manifest) {
  assertManifestShape(manifest);
  const expected = await buildManifest(root);
  const actualPaths = manifest.files.map((entry) => entry.path);
  const expectedPaths = expected.files.map((entry) => entry.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error('Manifest path set mismatch');
  }
  for (let index = 0; index < expected.files.length; index += 1) {
    if (manifest.files[index].sha256 !== expected.files[index].sha256) {
      throw new Error(`Digest mismatch: ${manifest.files[index].path}`);
    }
  }
  return expected.files.length;
}

function defaultOuterRoot() {
  const repositoryRoot = process.cwd();
  return path.basename(path.dirname(repositoryRoot)) === '.worktrees'
    ? path.resolve(repositoryRoot, '../../..')
    : path.resolve(repositoryRoot, '..');
}

async function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--root');
  const root = rootIndex === -1 ? defaultOuterRoot() : args[rootIndex + 1];
  if (!root) throw new Error('--root requires a path');
  const manifestPath = absolutePath(path.resolve(root), MANIFEST_RELATIVE_PATH);
  if (args.includes('--write')) {
    const manifest = await buildManifest(root);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, serializeManifest(manifest), 'utf8');
    console.log(`Wrote ${manifest.files.length} entries to ${MANIFEST_RELATIVE_PATH}`);
    return;
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const count = await verifyManifest(root, manifest);
  console.log(`Verified ${count} outer files with SHA-256`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Manifest verification failed');
    process.exitCode = 1;
  });
}
