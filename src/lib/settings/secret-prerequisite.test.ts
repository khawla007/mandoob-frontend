import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSecretPrerequisite } from './secret-prerequisite';

test('a prerequisite read failure blocks an SMTP/WhatsApp mutation even with a replacement secret', async () => {
  let mutated = false;
  const result = await resolveSecretPrerequisite({
    replacementSecret: 'new-secret',
    readExisting: async () => ({ secret: null, unavailable: true }),
    encrypt: (value) => `encrypted:${value}`,
    mutate: async () => {
      mutated = true;
    },
  });
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
  assert.equal(mutated, false);
});

test('a prerequisite read failure blocks an SMTP/WhatsApp mutation when retaining a secret', async () => {
  let mutated = false;
  const result = await resolveSecretPrerequisite({
    replacementSecret: '',
    readExisting: async () => ({ secret: null, unavailable: true }),
    encrypt: (value) => `encrypted:${value}`,
    mutate: async () => {
      mutated = true;
    },
  });
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
  assert.equal(mutated, false);
});

test('a missing prerequisite credential blocks mutation without pretending configuration is saved', async () => {
  let mutated = false;
  const result = await resolveSecretPrerequisite({
    replacementSecret: '',
    readExisting: async () => ({ secret: null, unavailable: false }),
    encrypt: (value) => `encrypted:${value}`,
    mutate: async () => {
      mutated = true;
    },
  });
  assert.deepEqual(result, { ok: false, reason: 'missing' });
  assert.equal(mutated, false);
});
