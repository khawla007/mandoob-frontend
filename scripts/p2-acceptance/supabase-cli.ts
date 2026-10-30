import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, readlink, rm, symlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { ACCEPTANCE_PROJECT_ID, ACCEPTANCE_WORKDIR } from './acceptance-paths';

export { ACCEPTANCE_CONFIG, ACCEPTANCE_PROJECT_ID, ACCEPTANCE_WORKDIR } from './acceptance-paths';
export const ACCEPTANCE_EXCLUDED_MIGRATION =
  '20260915090000_0087_reconcile_existing_pro_access.sql';

const replacements = [
  ['project_id = "mandoob"', `project_id = "${ACCEPTANCE_PROJECT_ID}"`],
  ['port = 54321', 'port = 56021'],
  ['port = 54322', 'port = 56022'],
  ['shadow_port = 54320', 'shadow_port = 56020'],
  ['port = 54329', 'port = 56029'],
  ['port = 54323', 'port = 56023'],
  ['port = 54324', 'port = 56024'],
  ['site_url = "http://127.0.0.1:3001"', 'site_url = "http://127.0.0.1:3100"'],
  [
    'additional_redirect_urls = ["https://127.0.0.1:3001"]',
    'additional_redirect_urls = ["http://localhost:3100"]',
  ],
  ['enroll_enabled = false', 'enroll_enabled = true'],
  ['verify_enabled = false', 'verify_enabled = true'],
  ['inspector_port = 8083', 'inspector_port = 56083'],
  ['port = 54327', 'port = 56027'],
] as const;

export function buildAcceptanceConfig(base: string): string {
  let config = base;
  for (const [ordinary, acceptance] of replacements) {
    if (!config.includes(ordinary)) {
      throw new Error(`P2_CLI: ordinary config contract missing ${ordinary.split(' = ')[0]}`);
    }
    config = config.replace(ordinary, acceptance);
  }
  return config;
}

type AcceptancePaths = {
  workdir?: string;
  baseConfig?: string;
  migrationsSource?: string;
};

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function assertPrivateOwnedDirectory(path: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`P2_CLI: unsafe runtime directory ${path}`);
  }
  if ((metadata.mode & 0o777) !== 0o700) {
    throw new Error(`P2_CLI: runtime directory must have mode 0700 ${path}`);
  }
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
    throw new Error(`P2_CLI: runtime directory ownership mismatch ${path}`);
  }
}

async function createPrivateDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  await assertPrivateOwnedDirectory(path);
}

async function writeExclusivePrivateFile(path: string, contents: string): Promise<void> {
  const handle = await open(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensurePrivateFile(path: string, contents: string): Promise<void> {
  try {
    await writeExclusivePrivateFile(path, contents);
    return;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
      throw new Error(`P2_CLI: unsafe runtime file ${path}`);
    }
    if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
      throw new Error(`P2_CLI: runtime file ownership mismatch ${path}`);
    }
    if ((await handle.readFile('utf8')) !== contents) {
      throw new Error(`P2_CLI: runtime file contents mismatch ${path}`);
    }
  } finally {
    await handle.close();
  }
}

async function ensureMigrationFileLink(runtimePath: string, sourcePath: string): Promise<void> {
  try {
    const metadata = await lstat(runtimePath);
    if (!metadata.isSymbolicLink()) throw new Error('P2_CLI: migration view entry is not isolated');
    if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
      throw new Error('P2_CLI: migration view entry ownership mismatch');
    }
    if (resolve(dirname(runtimePath), await readlink(runtimePath)) !== sourcePath) {
      throw new Error('P2_CLI: migration view entry target mismatch');
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
    await symlink(sourcePath, runtimePath, 'file');
  }
}

async function ensureAcceptanceMigrationView(
  migrations: string,
  migrationsSource: string,
): Promise<void> {
  await createPrivateDirectory(migrations);
  const sourceEntries = (await readdir(migrationsSource)).sort();
  if (!sourceEntries.includes(ACCEPTANCE_EXCLUDED_MIGRATION)) {
    throw new Error('P2_CLI: required excluded migration is missing');
  }
  const included = sourceEntries.filter((entry) => entry !== ACCEPTANCE_EXCLUDED_MIGRATION);
  for (const entry of sourceEntries) {
    const metadata = await lstat(resolve(migrationsSource, entry));
    if (!metadata.isFile() || metadata.isSymbolicLink() || !entry.endsWith('.sql')) {
      throw new Error(`P2_CLI: migration source entry must be a regular file ${entry}`);
    }
  }
  const existing = (await readdir(migrations)).sort();
  if (existing.some((entry) => !included.includes(entry))) {
    throw new Error('P2_CLI: migration view contains an unexpected entry');
  }
  for (const entry of included) {
    await ensureMigrationFileLink(resolve(migrations, entry), resolve(migrationsSource, entry));
  }
}

export async function prepareAcceptanceWorkdir(paths: AcceptancePaths = {}): Promise<void> {
  if (process.env.P2_ACCEPTANCE_LOCAL_ONLY !== '1') {
    throw new Error('P2_CLI: explicit local-only opt-in is required');
  }
  const workdir = resolve(paths.workdir ?? ACCEPTANCE_WORKDIR);
  const supabaseDirectory = resolve(workdir, 'supabase');
  const acceptanceConfig = resolve(supabaseDirectory, 'config.toml');
  const seed = resolve(supabaseDirectory, 'seed.sql');
  const migrationsSource = resolve(paths.migrationsSource ?? 'supabase/migrations');
  const sourceMetadata = await lstat(migrationsSource);
  if (!sourceMetadata.isDirectory() || sourceMetadata.isSymbolicLink()) {
    throw new Error('P2_CLI: migration source must be a real directory');
  }
  await createPrivateDirectory(workdir);
  await createPrivateDirectory(supabaseDirectory);
  await ensureAcceptanceMigrationView(resolve(supabaseDirectory, 'migrations'), migrationsSource);
  const base = await readFile(resolve(paths.baseConfig ?? 'supabase/config.toml'), 'utf8');
  await ensurePrivateFile(acceptanceConfig, buildAcceptanceConfig(base));
  await ensurePrivateFile(seed, '-- Intentionally empty P2 acceptance seed.\n');
}

export function runSupabase(
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding = { encoding: 'utf8' },
): string {
  const cli = process.env.SUPABASE_CLI?.trim() || 'supabase';
  return execFileSync(cli, ['--workdir', ACCEPTANCE_WORKDIR, ...args], options);
}

export async function removeAcceptanceWorkdir(): Promise<void> {
  await rm(ACCEPTANCE_WORKDIR, { recursive: true, force: true });
}
