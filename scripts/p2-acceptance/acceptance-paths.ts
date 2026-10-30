import { dirname, isAbsolute, relative, resolve } from 'node:path';

export const ACCEPTANCE_PROJECT_ID = 'mandoob-p2-12-acceptance';
export const ACCEPTANCE_WORKDIR = resolve('.p2-12-acceptance-runtime');
export const ACCEPTANCE_CONFIG = resolve(ACCEPTANCE_WORKDIR, 'supabase/config.toml');
export const DEFAULT_FIXTURE_SECRET_PATH = resolve('tests/.auth/p2-credentials.json');

export function isReducedAuthFixtureMode(env: Record<string, string | undefined>): boolean {
  return env.P3_13_REDUCED_AUTH_FIXTURE === '1';
}

function pathError(message: string): never {
  throw new Error(`P2_FIXTURE: ${message}`);
}

export function resolveFixtureSecretPath(env: Record<string, string | undefined>): string {
  const override = env.P3_13_REDUCED_AUTH_SECRET_PATH;
  if (!isReducedAuthFixtureMode(env)) {
    if (override) pathError('secret path override requires reduced mode');
    return DEFAULT_FIXTURE_SECRET_PATH;
  }
  if (!override) pathError('reduced secret path is required');
  const candidate = resolve(override);
  const nestedPath = relative(ACCEPTANCE_WORKDIR, candidate);
  if (
    !nestedPath ||
    isAbsolute(nestedPath) ||
    nestedPath === '..' ||
    nestedPath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    dirname(candidate) === ACCEPTANCE_WORKDIR
  ) {
    pathError('reduced secret path must be inside the private acceptance workdir');
  }
  return candidate;
}
