import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import { lstat, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const ACCEPTANCE_PROJECT_ID = 'mandoob-p2-12-acceptance';
export const ACCEPTANCE_WORKDIR = resolve('.p2-12-acceptance-runtime');
export const ACCEPTANCE_CONFIG = resolve(ACCEPTANCE_WORKDIR, 'supabase/config.toml');

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

export async function prepareAcceptanceWorkdir(): Promise<void> {
  if (process.env.P2_ACCEPTANCE_LOCAL_ONLY !== '1') {
    throw new Error('P2_CLI: explicit local-only opt-in is required');
  }
  const supabaseDirectory = dirname(ACCEPTANCE_CONFIG);
  await mkdir(supabaseDirectory, { recursive: true, mode: 0o700 });
  const base = await readFile(resolve('supabase/config.toml'), 'utf8');
  await writeFile(ACCEPTANCE_CONFIG, buildAcceptanceConfig(base), { mode: 0o600 });
  await writeFile(
    resolve(supabaseDirectory, 'seed.sql'),
    '-- Intentionally empty P2 acceptance seed.\n',
    {
      mode: 0o600,
    },
  );
  const migrations = resolve(supabaseDirectory, 'migrations');
  try {
    const metadata = await lstat(migrations);
    if (!metadata.isSymbolicLink()) throw new Error('P2_CLI: migrations path is not isolated');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    await symlink(resolve('supabase/migrations'), migrations, 'dir');
  }
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
