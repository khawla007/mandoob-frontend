import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  batchTransitionRenewalSchema,
  createRenewalSchema,
  transitionRenewalSchema,
  updateRenewalSchema,
} from './renewal';

const op = '22222222-2222-4222-8222-222222222222';

const validCompanyId = '11111111-1111-4111-8111-111111111111';

describe('createRenewalSchema', () => {
  it('accepts a valid payload', () => {
    const r = createRenewalSchema.safeParse({
      company_id: validCompanyId,
      type: 'visa',
      label: 'Operations manager — employment visa',
      due_date: '2026-12-31',
    });
    assert.equal(r.success, true);
  });

  it('rejects a missing company_id', () => {
    const r = createRenewalSchema.safeParse({
      type: 'license',
      label: 'Trade license',
      due_date: '2026-12-31',
    });
    assert.equal(r.success, false);
  });

  it('rejects an unknown type', () => {
    const r = createRenewalSchema.safeParse({
      company_id: validCompanyId,
      type: 'mortgage',
      label: 'Trade license',
      due_date: '2026-12-31',
    });
    assert.equal(r.success, false);
  });

  it('accepts every PRD renewal type and minor-unit costs', () => {
    for (const type of [
      'license',
      'visa',
      'investor_visa',
      'eid',
      'establishment_card',
      'ejari',
      'medical_insurance',
    ]) {
      const r = createRenewalSchema.safeParse({
        company_id: validCompanyId,
        type,
        label: 'Renewal',
        due_date: '2026-12-31',
        government_fee_minor: 150000,
        currency: 'AED',
      });
      assert.equal(r.success, true, type);
    }
    assert.equal(
      createRenewalSchema.safeParse({
        company_id: validCompanyId,
        type: 'visa',
        label: 'Visa',
        due_date: '2026-12-31',
        fine_minor: 10.5,
      }).success,
      false,
    );
  });

  it('keeps the legacy medical alias out of the app-supported type set', () => {
    const r = createRenewalSchema.safeParse({
      company_id: validCompanyId,
      type: 'medical',
      label: 'Medical insurance',
      due_date: '2026-12-31',
    });
    assert.equal(r.success, false);
  });

  it('rejects a label longer than 140 characters', () => {
    const r = createRenewalSchema.safeParse({
      company_id: validCompanyId,
      type: 'visa',
      label: 'x'.repeat(141),
      due_date: '2026-12-31',
    });
    assert.equal(r.success, false);
  });

  it('rejects a malformed due_date', () => {
    const r = createRenewalSchema.safeParse({
      company_id: validCompanyId,
      type: 'visa',
      label: 'Visa',
      due_date: '2026/12/31',
    });
    assert.equal(r.success, false);
  });
});

describe('updateRenewalSchema', () => {
  it('rejects an empty patch', () => {
    const r = updateRenewalSchema.safeParse({ operation_id: op, expected_version: 1 });
    assert.equal(r.success, false);
  });

  it('rejects direct status patches; stage changes use guarded transitions', () => {
    const r = updateRenewalSchema.safeParse({
      operation_id: op,
      expected_version: 1,
      status: 'completed',
    });
    assert.equal(r.success, false);
  });

  it('accepts a versioned blocker and cost patch', () => {
    const r = updateRenewalSchema.safeParse({
      operation_id: op,
      expected_version: 3,
      blocker_code: 'awaiting_medical',
      costs: { pro_service_fee_minor: 50000 },
    });
    assert.equal(r.success, true);
    assert.equal(
      updateRenewalSchema.safeParse({
        operation_id: op,
        expected_version: 3,
        blocker_code: 'Bad Code',
      }).success,
      false,
    );
  });
});

describe('transition schemas', () => {
  it('requires an operation id, expected version and a known stage', () => {
    assert.equal(
      transitionRenewalSchema.safeParse({
        operation_id: op,
        expected_version: 1,
        to_stage: 'in_progress',
      }).success,
      true,
    );
    assert.equal(
      transitionRenewalSchema.safeParse({ expected_version: 1, to_stage: 'in_progress' }).success,
      false,
    );
    assert.equal(
      transitionRenewalSchema.safeParse({
        operation_id: op,
        expected_version: 1,
        to_stage: 'overdue',
      }).success,
      false,
    );
  });

  it('bounds batches and rejects duplicate renewals', () => {
    const item = { renewal_id: validCompanyId, expected_version: 1 };
    assert.equal(
      batchTransitionRenewalSchema.safeParse({
        operation_id: op,
        to_stage: 'in_progress',
        items: [item],
      }).success,
      true,
    );
    assert.equal(
      batchTransitionRenewalSchema.safeParse({
        operation_id: op,
        to_stage: 'in_progress',
        items: [item, item],
      }).success,
      false,
    );
    assert.equal(
      batchTransitionRenewalSchema.safeParse({
        operation_id: op,
        to_stage: 'completed',
        items: [item],
      }).success,
      false,
    );
    assert.equal(
      batchTransitionRenewalSchema.safeParse({
        operation_id: op,
        to_stage: 'in_progress',
        items: [],
      }).success,
      false,
    );
  });
});
