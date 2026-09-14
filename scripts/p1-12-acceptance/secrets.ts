import { createHmac, randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';

export type RuntimeSecrets = {
  phase: 'planned' | 'auth-created' | 'profile-created' | 'content-created' | 'cleanup';
  email: string;
  password: string;
  userId?: string;
  totpSecret?: string;
};

const manifestPhases = new Set<RuntimeSecrets['phase']>([
  'planned',
  'auth-created',
  'profile-created',
  'content-created',
  'cleanup',
]);

function assertRuntimeSecrets(value: unknown): asserts value is RuntimeSecrets {
  if (!value || typeof value !== 'object') throw new Error('invalid manifest');
  const manifest = value as Record<string, unknown>;
  if (
    typeof manifest.phase !== 'string' ||
    !manifestPhases.has(manifest.phase as RuntimeSecrets['phase']) ||
    typeof manifest.email !== 'string' ||
    typeof manifest.password !== 'string' ||
    (manifest.phase !== 'planned' && typeof manifest.userId !== 'string') ||
    (manifest.userId !== undefined && typeof manifest.userId !== 'string') ||
    (manifest.totpSecret !== undefined && typeof manifest.totpSecret !== 'string')
  ) {
    throw new Error('invalid manifest');
  }
}

function assertSecretRoot(root: string): void {
  if (!isAbsolute(root) || basename(root) !== '.p1-12-acceptance-runtime') {
    throw new Error('P1.12 secret root rejected');
  }
}

type DurableFileHandle = {
  writeFile(value: string): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
};

type SecretFileOperations = {
  chmod(path: string, mode: number): Promise<void>;
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<void>;
  open(path: string, flags: 'r' | 'wx', mode?: number): Promise<DurableFileHandle>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
  rmdir(path: string): Promise<void>;
};

const defaultFileOperations: SecretFileOperations = {
  async chmod(path, mode) {
    await chmod(path, mode);
  },
  async mkdir(path, options) {
    await mkdir(path, options);
  },
  async open(path, flags, mode) {
    return open(path, flags, mode);
  },
  async readFile(path, encoding) {
    return readFile(path, encoding);
  },
  async rename(from, to) {
    await rename(from, to);
  },
  async rm(path, options) {
    await rm(path, options);
  },
  async rmdir(path) {
    await rmdir(path);
  },
};

async function syncDirectoryWhereSupported(
  root: string,
  fileOperations: SecretFileOperations,
): Promise<void> {
  let directory: DurableFileHandle | undefined;
  try {
    directory = await fileOperations.open(root, 'r');
    await directory.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!['EBADF', 'EINVAL', 'EISDIR', 'ENOTSUP'].includes(code ?? '')) throw error;
  } finally {
    await directory?.close();
  }
}

export function generateRuntimeCredentials(): Pick<RuntimeSecrets, 'email' | 'password'> {
  return {
    email: `p112-${randomBytes(18).toString('base64url')}@example.invalid`,
    password: `${randomBytes(24).toString('base64url')}aA1!`,
  };
}

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = value.toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  let bits = '';
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid TOTP secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totpAt(secret: string, timeMs = Date.now()): string {
  const counter = Math.floor(timeMs / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    1_000_000;
  return value.toString().padStart(6, '0');
}

export function createSecretStore(root: string, overrides: Partial<SecretFileOperations> = {}) {
  assertSecretRoot(root);
  const fileOperations: SecretFileOperations = { ...defaultFileOperations, ...overrides };
  const manifestPath = join(root, 'fixture-secrets.json');
  const temporaryManifestPath = join(root, 'fixture-secrets.json.next');
  return {
    async load(): Promise<RuntimeSecrets | null> {
      try {
        const parsed: unknown = JSON.parse(await fileOperations.readFile(manifestPath, 'utf8'));
        assertRuntimeSecrets(parsed);
        return parsed;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw new Error('P1.12 secret manifest unreadable');
      }
    },
    async save(value: RuntimeSecrets): Promise<void> {
      assertRuntimeSecrets(value);
      await fileOperations.mkdir(root, { recursive: true, mode: 0o700 });
      await fileOperations.chmod(root, 0o700);
      await fileOperations.rm(temporaryManifestPath, { force: true });
      let renamed = false;
      try {
        const temporary = await fileOperations.open(temporaryManifestPath, 'wx', 0o600);
        try {
          await temporary.writeFile(`${JSON.stringify(value)}\n`);
          await temporary.sync();
        } finally {
          await temporary.close();
        }
        await fileOperations.chmod(temporaryManifestPath, 0o600);
        await fileOperations.rename(temporaryManifestPath, manifestPath);
        renamed = true;
        await syncDirectoryWhereSupported(root, fileOperations);
      } catch (error) {
        if (!renamed) await fileOperations.rm(temporaryManifestPath, { force: true });
        throw error;
      }
    },
    async remove(): Promise<void> {
      await fileOperations.rm(temporaryManifestPath, { force: true });
      await fileOperations.rm(manifestPath, { force: true });
      await fileOperations.rmdir(root).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error;
      });
    },
  };
}

export type SecretStore = ReturnType<typeof createSecretStore>;
