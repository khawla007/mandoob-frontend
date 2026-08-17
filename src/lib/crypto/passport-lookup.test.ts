import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

test('passport lookup hash is normalized, deterministic, keyed, and nullable', async () => {
  const { hashPassportForLookup } = await import('./passport-lookup');

  const first = hashPassportForLookup('company-a', ' ab-123 ');
  assert.equal(first, hashPassportForLookup('COMPANY-A', 'AB-123'));
  assert.match(first ?? '', /^[a-f0-9]{64}$/u);
  assert.notEqual(first, hashPassportForLookup('company-a', 'AB-124'));
  assert.notEqual(first, hashPassportForLookup('company-b', 'AB-123'));
  assert.equal(hashPassportForLookup('company-a', '   '), null);
  assert.doesNotMatch(first ?? '', /AB-123|ab-123/u);
});
