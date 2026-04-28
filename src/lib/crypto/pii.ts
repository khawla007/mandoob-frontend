import 'server-only';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALG = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('PII_KEY_MISSING');
  // Buffer.from(_, 'base64') silently drops invalid characters; the length check below
  // catches both wholly-invalid input and a too-short / too-long key.
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('PII_KEY_INVALID_LENGTH');
  return buf;
}

const KEY = loadKey();

export function encrypt(plaintext: string): string {
  try {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALG, KEY, nonce);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}:${nonce.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
  } catch {
    throw new Error('PII_ENCRYPT_FAILED');
  }
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4) throw new Error('PII_DECRYPT_FAILED');
  const [version, b64Nonce, b64Tag, b64Ct] = parts;
  if (version !== VERSION) throw new Error('PII_VERSION_UNSUPPORTED');
  // Buffer.from(_, 'base64') is total — invalid chars get dropped, never thrown.
  // Length check + GCM tag verification below cover all bad payloads.
  const nonce = Buffer.from(b64Nonce, 'base64');
  const tag = Buffer.from(b64Tag, 'base64');
  const ct = Buffer.from(b64Ct, 'base64');
  if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('PII_DECRYPT_FAILED');
  }
  try {
    const decipher = createDecipheriv(ALG, KEY, nonce);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    throw new Error('PII_DECRYPT_FAILED');
  }
}

export function encryptOptional(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  return encrypt(s);
}

export function decryptOptional(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  return decrypt(s);
}
