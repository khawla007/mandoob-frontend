// Run with: npm test
//
// Why `node --import tsx --conditions=react-server`:
//   - tsx loads .ts files at import time.
//   - --conditions=react-server makes Node resolve the `react-server` conditional
//     export of the `server-only` package (which is a no-op stub), instead of the
//     default export which `throw`s on bare-Node import. Next's RSC build sets the
//     same condition; this mirrors that behavior for tests.
// The child-process harness below (`runUnderEnv`) re-applies the same flags.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

type PiiModule = typeof import('./pii');
let piiPromise: Promise<PiiModule> | null = null;
function loadPii(): Promise<PiiModule> {
  if (!piiPromise) piiPromise = import('./pii');
  return piiPromise;
}

describe('pii crypto module load', () => {
  it('imports without throwing when ENCRYPTION_KEY is a valid 32-byte base64 string', async () => {
    const mod = await loadPii();
    assert.equal(typeof mod.encrypt, 'function');
    assert.equal(typeof mod.decrypt, 'function');
    assert.equal(typeof mod.encryptOptional, 'function');
    assert.equal(typeof mod.decryptOptional, 'function');
  });
});

describe('pii encrypt/decrypt roundtrip', () => {
  it('roundtrips ASCII', async () => {
    const { encrypt, decrypt } = await loadPii();
    const input = 'Hello, world!';
    assert.equal(decrypt(encrypt(input)), input);
  });

  it('roundtrips Arabic + emoji', async () => {
    const { encrypt, decrypt } = await loadPii();
    const input = 'مرحبا 🇦🇪 صباح الخير';
    assert.equal(decrypt(encrypt(input)), input);
  });

  it('roundtrips empty string', async () => {
    const { encrypt, decrypt } = await loadPii();
    assert.equal(decrypt(encrypt('')), '');
  });
});

describe('pii nonce uniqueness', () => {
  it('produces a different ciphertext for the same plaintext over 100 iterations', async () => {
    const { encrypt } = await loadPii();
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(encrypt('repeat'));
    }
    assert.equal(seen.size, 100);
  });
});

describe('pii tamper detection', () => {
  it('throws PII_DECRYPT_FAILED when the auth tag is mutated', async () => {
    const { encrypt, decrypt } = await loadPii();
    const ct = encrypt('sensitive');
    const parts = ct.split(':');
    const tag = Buffer.from(parts[2], 'base64');
    tag[0] ^= 0x01;
    parts[2] = tag.toString('base64');
    const tampered = parts.join(':');
    assert.throws(() => decrypt(tampered), /PII_DECRYPT_FAILED/);
  });

  it('throws PII_DECRYPT_FAILED when the ciphertext body is mutated', async () => {
    const { encrypt, decrypt } = await loadPii();
    const ct = encrypt('sensitive');
    const parts = ct.split(':');
    const body = Buffer.from(parts[3], 'base64');
    body[0] ^= 0x01;
    parts[3] = body.toString('base64');
    const tampered = parts.join(':');
    assert.throws(() => decrypt(tampered), /PII_DECRYPT_FAILED/);
  });

  it('throws PII_DECRYPT_FAILED on malformed structure', async () => {
    const { decrypt } = await loadPii();
    assert.throws(() => decrypt('not-a-payload'), /PII_DECRYPT_FAILED/);
    assert.throws(() => decrypt('v1:only:two'), /PII_DECRYPT_FAILED/);
  });
});

describe('pii version handling', () => {
  it('throws PII_VERSION_UNSUPPORTED on a non-v1 prefix', async () => {
    const { decrypt } = await loadPii();
    const fakeNonce = Buffer.alloc(12).toString('base64');
    const fakeTag = Buffer.alloc(16).toString('base64');
    const fakeCt = Buffer.from('xx').toString('base64');
    const payload = `v2:${fakeNonce}:${fakeTag}:${fakeCt}`;
    assert.throws(() => decrypt(payload), /PII_VERSION_UNSUPPORTED/);
  });
});

describe('pii optional helpers', () => {
  it('encryptOptional passes null and undefined through as null', async () => {
    const { encryptOptional } = await loadPii();
    assert.equal(encryptOptional(null), null);
    assert.equal(encryptOptional(undefined), null);
  });

  it('decryptOptional passes null and undefined through as null', async () => {
    const { decryptOptional } = await loadPii();
    assert.equal(decryptOptional(null), null);
    assert.equal(decryptOptional(undefined), null);
  });

  it('round-trips a non-null value via the optional helpers', async () => {
    const { encryptOptional, decryptOptional } = await loadPii();
    const ct = encryptOptional('A123456');
    assert.notEqual(ct, null);
    assert.equal(decryptOptional(ct), 'A123456');
  });

  it('throws on empty string into decryptOptional (only null/undefined short-circuit)', async () => {
    const { decryptOptional } = await loadPii();
    assert.throws(() => decryptOptional(''), /PII_DECRYPT_FAILED/);
  });
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = path.join(HERE, 'pii.ts');

function runUnderEnv(
  envOverride: Record<string, string | undefined>,
  body: string,
): { status: number | null; stdout: string; stderr: string } {
  // Use a temporary `.mts` file (true ESM) so top-level `await` and named imports
  // resolve correctly under `tsx`. Inline `-e` programs are interpreted as CJS by
  // tsx and turn ESM exports into `{ default, module.exports }` — making
  // `mod.encrypt` undefined.
  const program = `
const mod = await import(${JSON.stringify(MODULE_PATH)});
try {
  ${body}
} catch (e) {
  console.log('THREW:' + (e && e.message ? e.message : String(e)));
  process.exit(2);
}
`;
  const dir = mkdtempSync(path.join(tmpdir(), 'pii-test-'));
  const file = path.join(dir, 'run.mts');
  writeFileSync(file, program);
  const env: Record<string, string | undefined> = { ...process.env, ...envOverride };
  for (const k of Object.keys(envOverride)) {
    if (envOverride[k] === undefined) delete env[k];
  }
  try {
    const res = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--conditions=react-server', file],
      {
        env: env as NodeJS.ProcessEnv,
        encoding: 'utf8',
      },
    );
    return { status: res.status, stdout: res.stdout, stderr: res.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('pii boot-time errors', () => {
  it('throws PII_KEY_MISSING when ENCRYPTION_KEY is unset', () => {
    const out = runUnderEnv({ ENCRYPTION_KEY: undefined }, 'console.log("loaded")');
    assert.match(out.stdout + out.stderr, /PII_KEY_MISSING/);
    assert.notEqual(out.status, 0);
  });

  it('throws PII_KEY_INVALID_LENGTH when key decodes to fewer than 32 bytes', () => {
    const shortKey = Buffer.alloc(16, 7).toString('base64');
    const out = runUnderEnv({ ENCRYPTION_KEY: shortKey }, 'console.log("loaded")');
    assert.match(out.stdout + out.stderr, /PII_KEY_INVALID_LENGTH/);
    assert.notEqual(out.status, 0);
  });

  it('a ciphertext encrypted under one key fails to decrypt under another', () => {
    const keyA = Buffer.alloc(32, 1).toString('base64');
    const keyB = Buffer.alloc(32, 2).toString('base64');
    const dir = mkdtempSync(path.join(tmpdir(), 'pii-ciphertext-'));
    const ciphertextFile = path.join(dir, 'ciphertext.txt');
    const errorFile = path.join(dir, 'error.txt');

    try {
      const enc = runUnderEnv(
        { ENCRYPTION_KEY: keyA },
        `const { writeFileSync } = await import('node:fs');
         writeFileSync(${JSON.stringify(ciphertextFile)}, mod.encrypt("secret"), 'utf8');`,
      );
      assert.equal(enc.status, 0, enc.stderr);
      const ct = readFileSync(ciphertextFile, 'utf8');

      const dec = runUnderEnv(
        { ENCRYPTION_KEY: keyB },
        `try { console.log("OK:" + mod.decrypt(${JSON.stringify(ct)})); }
         catch (e) {
           const { writeFileSync } = await import('node:fs');
           writeFileSync(${JSON.stringify(errorFile)}, e.message, 'utf8');
           process.exit(2);
         }`,
      );
      assert.match(readFileSync(errorFile, 'utf8'), /PII_DECRYPT_FAILED/);
      assert.notEqual(dec.status, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
