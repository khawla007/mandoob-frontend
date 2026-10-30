import assert from 'node:assert/strict';
import test from 'node:test';
import { planIdentifierMaskBackfill } from './mask-backfill';

const decrypt = (value: string) => {
  if (value === 'broken') throw new Error('PII_DECRYPT_FAILED');
  return value.replace(/^enc:/u, '');
};

test('code-review F6: backfill derives last4 and a bound source only for missing masks', () => {
  const patch = planIdentifierMaskBackfill(
    {
      id: 'e1',
      passport_no_encrypted: 'enc:P1234567',
      passport_no_last4: null,
      visa_no_encrypted: null,
      visa_no_last4: null,
      emirates_id_encrypted: 'enc:784-1990-1234567-1',
      emirates_id_last4: '5671',
    },
    decrypt,
  );
  assert.equal(patch?.passport_no_last4, '4567');
  assert.match(String(patch?.passport_no_last4_source), /^[a-f0-9]{64}$/u);
  assert.equal('emirates_id_last4' in (patch ?? {}), false);
  assert.equal('visa_no_last4' in (patch ?? {}), false);
});

test('code-review F6: undecryptable or already-complete rows are skipped, never guessed', () => {
  const base = {
    id: 'e2',
    visa_no_encrypted: null,
    visa_no_last4: null,
    emirates_id_encrypted: null,
    emirates_id_last4: null,
  };
  assert.equal(
    planIdentifierMaskBackfill(
      { ...base, passport_no_encrypted: 'broken', passport_no_last4: null },
      decrypt,
    ),
    null,
  );
  assert.equal(
    planIdentifierMaskBackfill(
      { ...base, passport_no_encrypted: 'enc:X1', passport_no_last4: 'X1' },
      decrypt,
    ),
    null,
  );
});
