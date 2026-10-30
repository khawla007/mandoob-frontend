import { accessSync, constants, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';

function browserPathError(): never {
  throw new Error(
    'P3_13_AUTH_SMOKE: browser executable must be an absolute canonical executable regular file',
  );
}

export function resolveReducedBrowserExecutable(
  env: Record<string, string | undefined>,
): string | undefined {
  const configured = env.P3_13_BROWSER_EXECUTABLE;
  if (configured === undefined) return undefined;
  if (!configured || configured !== configured.trim() || !isAbsolute(configured)) {
    return browserPathError();
  }
  try {
    const metadata = lstatSync(configured);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      realpathSync(configured) !== configured
    ) {
      return browserPathError();
    }
    accessSync(configured, constants.X_OK);
  } catch {
    return browserPathError();
  }
  return configured;
}
