import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRenewalSchema, updateRenewalSchema } from './renewal';

const validClientId = '11111111-1111-4111-8111-111111111111';

describe('createRenewalSchema', () => {
  it('accepts a valid payload', () => {
    const r = createRenewalSchema.safeParse({
      client_id: validClientId,
      type: 'visa',
      label: 'Operations manager — employment visa',
      due_date: '2026-12-31',
    });
    assert.equal(r.success, true);
  });

  it('rejects a missing client_id', () => {
    const r = createRenewalSchema.safeParse({
      type: 'license',
      label: 'Trade license',
      due_date: '2026-12-31',
    });
    assert.equal(r.success, false);
  });

  it('rejects an unknown type', () => {
    const r = createRenewalSchema.safeParse({
      client_id: validClientId,
      type: 'mortgage',
      label: 'Trade license',
      due_date: '2026-12-31',
    });
    assert.equal(r.success, false);
  });

  it('keeps medical renewals out of the app-supported type set', () => {
    const r = createRenewalSchema.safeParse({
      client_id: validClientId,
      type: 'medical',
      label: 'Medical insurance',
      due_date: '2026-12-31',
    });
    assert.equal(r.success, false);
  });

  it('rejects a label longer than 140 characters', () => {
    const r = createRenewalSchema.safeParse({
      client_id: validClientId,
      type: 'visa',
      label: 'x'.repeat(141),
      due_date: '2026-12-31',
    });
    assert.equal(r.success, false);
  });

  it('rejects a malformed due_date', () => {
    const r = createRenewalSchema.safeParse({
      client_id: validClientId,
      type: 'visa',
      label: 'Visa',
      due_date: '2026/12/31',
    });
    assert.equal(r.success, false);
  });
});

describe('updateRenewalSchema', () => {
  it('rejects an empty patch', () => {
    const r = updateRenewalSchema.safeParse({});
    assert.equal(r.success, false);
  });

  it('accepts a single-field status patch', () => {
    const r = updateRenewalSchema.safeParse({ status: 'completed' });
    assert.equal(r.success, true);
  });
});
