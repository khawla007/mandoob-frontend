import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename } from 'node:fs/promises';
import path from 'node:path';

export async function assertP112NoSymlinkPath(root: string, target: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error('P1.12 filesystem path escapes root');
  try {
    if ((await lstat(resolvedRoot)).isSymbolicLink())
      throw new Error('P1.12 symlink root rejected');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let current = resolvedRoot;
  for (const component of path
    .relative(resolvedRoot, resolvedTarget)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, component);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('P1.12 symlink path rejected');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  try {
    const canonicalRoot = await realpath(resolvedRoot);
    const existingParent = await realpath(path.dirname(resolvedTarget));
    if (
      existingParent !== canonicalRoot &&
      !existingParent.startsWith(`${canonicalRoot}${path.sep}`)
    )
      throw new Error('P1.12 realpath escapes root');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function writeP112AtomicPrivateFile(
  root: string,
  file: string,
  contents: string | Buffer,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await assertP112NoSymlinkPath(root, file);
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(contents, typeof contents === 'string' ? 'utf8' : undefined);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await assertP112NoSymlinkPath(root, file);
  await rename(temporary, file);
}
