import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { decryptImportArtifact, encryptImportArtifact, sha256Hex } from './import-artifact';

const key = randomBytes(32);

test('artifact encryption round-trips and is authenticated', () => {
  const plain = new TextEncoder().encode('name,passport_no\nA,P1\n');
  const sealed = encryptImportArtifact(plain, key);
  assert.equal(Buffer.from(sealed).includes(Buffer.from('P1')), false);
  assert.deepEqual(decryptImportArtifact(sealed, key), plain);
  const tampered = new Uint8Array(sealed);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptImportArtifact(tampered, key), /IMPORT_ARTIFACT_DECRYPT_FAILED/u);
  assert.throws(
    () => decryptImportArtifact(sealed, randomBytes(32)),
    /IMPORT_ARTIFACT_DECRYPT_FAILED/u,
  );
  assert.throws(
    () => decryptImportArtifact(new Uint8Array(4), key),
    /IMPORT_ARTIFACT_DECRYPT_FAILED/u,
  );
});

test('sha256 is lowercase hex over plaintext bytes', () => {
  assert.equal(
    sha256Hex(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
