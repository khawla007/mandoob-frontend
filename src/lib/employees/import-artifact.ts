import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('MIA1');
const NONCE = 12;
const TAG = 16;

/** Domain-separated artifact key derived from the platform PII key. */
export function deriveImportArtifactKey(rootKey: Buffer): Buffer {
  return Buffer.from(
    hkdfSync('sha256', rootKey, Buffer.alloc(0), 'mandoob:employee-import-artifact:v1', 32),
  );
}

export function loadImportArtifactKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('PII_KEY_MISSING');
  const root = Buffer.from(raw, 'base64');
  if (root.length !== 32) throw new Error('PII_KEY_INVALID_LENGTH');
  return deriveImportArtifactKey(root);
}

export function encryptImportArtifact(plain: Uint8Array, key: Buffer): Uint8Array {
  const nonce = randomBytes(NONCE);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return new Uint8Array(Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), body]));
}

export function decryptImportArtifact(sealed: Uint8Array, key: Buffer): Uint8Array {
  const buffer = Buffer.from(sealed);
  if (buffer.length < MAGIC.length + NONCE + TAG || !buffer.subarray(0, 4).equals(MAGIC)) {
    throw new Error('IMPORT_ARTIFACT_DECRYPT_FAILED');
  }
  try {
    const nonce = buffer.subarray(4, 4 + NONCE);
    const tag = buffer.subarray(4 + NONCE, 4 + NONCE + TAG);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(MAGIC);
    decipher.setAuthTag(tag);
    return new Uint8Array(
      Buffer.concat([decipher.update(buffer.subarray(4 + NONCE + TAG)), decipher.final()]),
    );
  } catch {
    throw new Error('IMPORT_ARTIFACT_DECRYPT_FAILED');
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
