import { chmod, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';

import { renderP112Config } from './guard-config';

function assertRuntimeRoot(runtimeRoot: string): void {
  if (!isAbsolute(runtimeRoot) || basename(runtimeRoot) !== '.p1-12-acceptance-runtime') {
    throw new Error('P1.12 runtime project path rejected');
  }
}

export async function prepareRuntimeProject(input: {
  sourceSupabaseDirectory: string;
  runtimeRoot: string;
}): Promise<{ workdir: string; configPath: string }> {
  assertRuntimeRoot(input.runtimeRoot);
  const source = resolve(input.sourceSupabaseDirectory);
  const destination = join(input.runtimeRoot, 'supabase');
  try {
    const rootStat = await lstat(input.runtimeRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error('P1.12 runtime project state rejected');
    }
    if ((await readdir(input.runtimeRoot)).length !== 0) {
      throw new Error('P1.12 runtime project state rejected');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await mkdir(input.runtimeRoot, { mode: 0o700 });
  }
  await chmod(input.runtimeRoot, 0o700);
  await mkdir(destination, { mode: 0o700 });
  await cp(join(source, 'migrations'), join(destination, 'migrations'), { recursive: true });
  await cp(join(source, 'seed.sql'), join(destination, 'seed.sql'));
  const configPath = join(destination, 'config.toml');
  const config = renderP112Config(await readFile(join(source, 'config.toml'), 'utf8'));
  await writeFile(configPath, config, { mode: 0o600, flag: 'w' });
  await chmod(configPath, 0o600);
  return { workdir: input.runtimeRoot, configPath };
}

export async function cleanupRuntimeProject(runtimeRoot: string): Promise<void> {
  assertRuntimeRoot(runtimeRoot);
  await rm(runtimeRoot, { recursive: true, force: true });
}
