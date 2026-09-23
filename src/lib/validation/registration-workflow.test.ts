import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REASON_CODE_CATEGORY,
  STAGE_REASON_CODES,
  adminRegistrationQuerySchema,
  cancelVisaPersonSchema,
  createRegistrationSchema,
  createVisaPersonSchema,
  linkStageDocumentSchema,
  recoverUnlinkStageDocumentSchema,
  transitionStageSchema,
  transitionVisaPersonSchema,
  unlinkStageDocumentSchema,
} from './registration-workflow';
import { REGISTRATION_BLOCKER_CATEGORIES } from '@/lib/registration/contracts';

const uuidA = '11111111-1111-4111-8111-111111111111';
const uuidB = '22222222-2222-4222-8222-222222222222';
const uuidC = '33333333-3333-4333-8333-333333333333';
const uuidD = '44444444-4444-4444-8444-444444444444';

test('create registration accepts a well-formed input and rejects unknown keys', () => {
  const ok = createRegistrationSchema.parse({
    companyId: uuidA,
    title: 'New Mainland LLC',
    priority: 'normal',
    dueAt: '2026-10-01T00:00:00.000Z',
    operationId: uuidB,
  });
  assert.equal(ok.title, 'New Mainland LLC');
  assert.equal(createRegistrationSchema.safeParse({}).success, false);
  assert.equal(
    createRegistrationSchema.safeParse({
      companyId: uuidA,
      title: 'ok',
      priority: 'normal',
      dueAt: null,
      operationId: uuidB,
      extra: 1,
    }).success,
    false,
  );
  assert.equal(
    createRegistrationSchema.safeParse({
      companyId: uuidA,
      title: 'x',
      priority: 'normal',
      dueAt: null,
      operationId: uuidB,
    }).success,
    false,
  );
});

test('transition stage requires a reason only for block/unblock/skip/recover', () => {
  const blocked = transitionStageSchema.parse({
    registrationId: uuidA,
    stageId: uuidB,
    command: 'block',
    expectedRegistrationVersion: 1,
    expectedStageVersion: 1,
    reasonCode: 'AUTHORITY_DELAY',
    reasonText: 'Awaiting authority response',
    operationId: uuidC,
  });
  assert.equal(blocked.reasonCode, 'AUTHORITY_DELAY');
  assert.deepEqual(blocked.details, {});

  // start must not carry a reason
  assert.equal(
    transitionStageSchema.safeParse({
      registrationId: uuidA,
      stageId: uuidB,
      command: 'start',
      expectedRegistrationVersion: 1,
      expectedStageVersion: 1,
      reasonCode: 'AUTHORITY_DELAY',
      reasonText: 'nope',
      operationId: uuidC,
    }).success,
    false,
  );
  // block missing reason
  assert.equal(
    transitionStageSchema.safeParse({
      registrationId: uuidA,
      stageId: uuidB,
      command: 'block',
      expectedRegistrationVersion: 1,
      expectedStageVersion: 1,
      operationId: uuidC,
    }).success,
    false,
  );
  // negative version rejected
  assert.equal(
    transitionStageSchema.safeParse({
      registrationId: uuidA,
      stageId: uuidB,
      command: 'start',
      expectedRegistrationVersion: -1,
      expectedStageVersion: 0,
      operationId: uuidC,
    }).success,
    false,
  );
});

test('every stage reason code maps to an allowlisted blocker category', () => {
  const categories = new Set(REGISTRATION_BLOCKER_CATEGORIES);
  for (const code of STAGE_REASON_CODES) {
    assert.ok(categories.has(REASON_CODE_CATEGORY[code]), `${code} maps to a valid category`);
  }
});

test('link stage document validates role enum and uuids', () => {
  assert.ok(
    linkStageDocumentSchema.parse({
      registrationId: uuidA,
      stageId: uuidB,
      documentId: uuidC,
      documentVersionId: uuidD,
      role: 'application_form',
      operationId: uuidA,
    }),
  );
  assert.equal(
    linkStageDocumentSchema.safeParse({
      registrationId: uuidA,
      stageId: uuidB,
      documentId: uuidC,
      documentVersionId: uuidD,
      role: 'passport',
      operationId: uuidA,
    }).success,
    false,
  );
  assert.ok(
    unlinkStageDocumentSchema.parse({
      registrationId: uuidA,
      stageId: uuidB,
      linkId: uuidC,
      operationId: uuidD,
    }),
  );
  assert.equal(
    recoverUnlinkStageDocumentSchema.safeParse({
      registrationId: uuidA,
      stageId: uuidB,
      linkId: uuidC,
      reason: 'x',
      operationId: uuidD,
    }).success,
    false,
  );
});

test('create visa person enforces the person/visa kind + source pairing', () => {
  assert.ok(
    createVisaPersonSchema.parse({
      registrationId: uuidA,
      personKind: 'shareholder',
      visaKind: 'investor',
      shareholderId: uuidB,
      displayName: 'Aisha Khan',
      operationId: uuidC,
    }),
  );
  assert.ok(
    createVisaPersonSchema.parse({
      registrationId: uuidA,
      personKind: 'dependent',
      visaKind: 'family',
      displayName: 'Sam Dependent',
      operationId: uuidC,
    }),
  );
  // shareholder without a shareholderId is invalid
  assert.equal(
    createVisaPersonSchema.safeParse({
      registrationId: uuidA,
      personKind: 'shareholder',
      visaKind: 'investor',
      displayName: 'Aisha Khan',
      operationId: uuidC,
    }).success,
    false,
  );
  // mismatched visa kind is invalid
  assert.equal(
    createVisaPersonSchema.safeParse({
      registrationId: uuidA,
      personKind: 'employee',
      visaKind: 'investor',
      employeeId: uuidB,
      displayName: 'Aisha Khan',
      operationId: uuidC,
    }).success,
    false,
  );
  // control characters / angle brackets rejected
  assert.equal(
    createVisaPersonSchema.safeParse({
      registrationId: uuidA,
      personKind: 'dependent',
      visaKind: 'family',
      displayName: 'Bad<name>',
      operationId: uuidC,
    }).success,
    false,
  );
});

test('visa transition and cancel enforce reason presence rules', () => {
  assert.ok(
    transitionVisaPersonSchema.parse({
      registrationId: uuidA,
      visaPersonId: uuidB,
      command: 'advance',
      toStage: 'entry_permit',
      expectedVisaVersion: 2,
      operationId: uuidC,
    }),
  );
  assert.equal(
    transitionVisaPersonSchema.safeParse({
      registrationId: uuidA,
      visaPersonId: uuidB,
      command: 'block',
      toStage: 'entry_permit',
      expectedVisaVersion: 2,
      operationId: uuidC,
    }).success,
    false,
  );
  assert.ok(
    cancelVisaPersonSchema.parse({
      registrationId: uuidA,
      visaPersonId: uuidB,
      expectedVisaVersion: 1,
      reasonCode: 'DUPLICATE_PERSON',
      reasonText: 'Created twice',
      operationId: uuidC,
    }),
  );
  assert.equal(
    cancelVisaPersonSchema.safeParse({
      registrationId: uuidA,
      visaPersonId: uuidB,
      expectedVisaVersion: 1,
      reasonCode: 'WRONG_CODE',
      reasonText: 'Created twice',
      operationId: uuidC,
    }).success,
    false,
  );
});

test('admin query trims/slices text filters and clamps the page', () => {
  const parsed = adminRegistrationQuerySchema.parse({
    company: `  ${'a'.repeat(150)}  `,
    pro: '   ',
    stage: 'name_reservation',
    status: 'blocked',
    page: '3',
  });
  assert.equal(parsed.company?.length, 100);
  assert.equal(parsed.pro, null);
  assert.equal(parsed.stage, 'name_reservation');
  assert.equal(parsed.status, 'blocked');
  assert.equal(parsed.page, 3);

  const defaults = adminRegistrationQuerySchema.parse({});
  assert.deepEqual(defaults, {
    company: null,
    pro: null,
    stage: 'all',
    status: 'all',
    page: 1,
  });

  assert.equal(adminRegistrationQuerySchema.safeParse({ page: 20000 }).success, false);
  assert.equal(adminRegistrationQuerySchema.safeParse({ stage: 'bogus' }).success, false);
});

test('adminRegistrationIndexQuerySchema enforces nullable uuid + enum filters and clamps page', async () => {
  const { adminRegistrationIndexQuerySchema } = await import('./registration-workflow');
  const uuid = '12121212-1212-4212-8212-121212121212';
  const parsed = adminRegistrationIndexQuerySchema.parse({
    company: uuid,
    pro: null,
    stage: 'name_reservation',
    status: 'blocked',
    page: 3,
  });
  assert.deepEqual(parsed, {
    company: uuid,
    pro: null,
    stage: 'name_reservation',
    status: 'blocked',
    page: 3,
  });

  assert.deepEqual(adminRegistrationIndexQuerySchema.parse({}), {
    company: null,
    pro: null,
    stage: null,
    status: null,
    page: 1,
  });

  assert.equal(adminRegistrationIndexQuerySchema.safeParse({ company: 'Acme' }).success, false);
  assert.equal(adminRegistrationIndexQuerySchema.safeParse({ stage: 'all' }).success, false);
  assert.equal(adminRegistrationIndexQuerySchema.safeParse({ page: 0 }).success, false);
  assert.equal(adminRegistrationIndexQuerySchema.safeParse({ page: 10001 }).success, false);
});
