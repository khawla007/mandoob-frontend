import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTACT_LIMITS,
  CONTACT_SUBJECTS,
  type ContactFieldName,
  type RawContactPayload,
} from './contracts';
import { normalizeUaePhone, validateContactSubmission } from './validation';

const validPayload = (overrides: Partial<RawContactPayload> = {}): RawContactPayload => ({
  fullName: 'Amina Noor',
  email: 'amina@example.com',
  phone: '+971501234567',
  subject: 'company_setup',
  message: 'Please help me set up my company.',
  consent: true,
  ...overrides,
});

function expectValid(payload: RawContactPayload) {
  const result = validateContactSubmission(payload);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Expected valid contact payload');
  return result.data;
}

function errorsFor(payload: RawContactPayload) {
  const result = validateContactSubmission(payload);
  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) throw new Error('Expected invalid contact payload');
  return result.errors;
}

test('exports the complete, closed contact subject list and explicit limits', () => {
  assert.deepEqual(CONTACT_SUBJECTS, [
    'company_setup',
    'cost_estimate',
    'document_requirements',
    'visa_immigration',
    'banking_guidance',
    'license_renewal',
    'other',
  ]);
  assert.deepEqual(CONTACT_LIMITS, {
    fullNameMin: 2,
    fullNameMax: 100,
    emailMax: 254,
    phoneMax: 32,
    messageMin: 10,
    messageMax: 2_000,
  });
});

test('normalizes whitespace and lower-cases email in the returned payload', () => {
  const data = expectValid(
    validPayload({
      fullName: '  Amina\t  Noor  ',
      email: '  Amina.Noor@EXAMPLE.COM ',
      message: '  Please\n\t help   with company setup.  ',
      subject: ' company_setup ',
    }),
  );

  assert.deepEqual(data, {
    fullName: 'Amina Noor',
    email: 'amina.noor@example.com',
    phone: '+971501234567',
    subject: 'company_setup',
    message: 'Please help with company setup.',
    consent: true,
  });
});

test('normalizes common UAE mobile and landline display forms to E.164', () => {
  const cases: Array<[string, string]> = [
    ['+971 50 123 4567', '+971501234567'],
    ['00971-52-123-4567', '+971521234567'],
    ['971 (54) 123 4567', '+971541234567'],
    ['055 123 4567', '+971551234567'],
    ['58 123 4567', '+971581234567'],
    ['+971 4 123 4567', '+97141234567'],
    ['00971 (2) 123 4567', '+97121234567'],
    ['06-123-4567', '+97161234567'],
  ];

  for (const [raw, expected] of cases) {
    assert.equal(normalizeUaePhone(raw), expected, raw);
    assert.equal(expectValid(validPayload({ phone: raw })).phone, expected, raw);
  }
});

test('normalizes optional trunk zero in UAE international display forms', () => {
  const cases: Array<[string, string]> = [
    ['+971 (0) 50 123 4567', '+971501234567'],
    ['+971 (0) 4 123 4567', '+97141234567'],
  ];

  for (const [raw, expected] of cases) {
    assert.equal(normalizeUaePhone(raw), expected, raw);
    assert.equal(expectValid(validPayload({ phone: raw })).phone, expected, raw);
  }
});

test('preserves international prefix semantics instead of relabeling foreign numbers as UAE', () => {
  for (const phone of [
    '+50 123 4567',
    '+4 123 4567',
    '+00971 50 123 4567',
    '+44 50 123 4567',
    '0050 123 4567',
    '0044 4 123 4567',
  ]) {
    assert.equal(normalizeUaePhone(phone), null, phone);
    const [error] = errorsFor(validPayload({ phone }));
    assert.deepEqual({ field: error.field, code: error.code }, { field: 'phone', code: 'invalid' });
  }
});

test('rejects empty required fields with linked, field-specific errors', () => {
  const errors = errorsFor({
    fullName: ' ',
    email: '\t',
    phone: '',
    subject: ' ',
    message: '\n',
    consent: false,
  });
  const expectedFields: ContactFieldName[] = [
    'fullName',
    'email',
    'phone',
    'subject',
    'message',
    'consent',
  ];

  assert.deepEqual(
    errors.map((error) => error.field),
    expectedFields,
  );
  for (const error of errors) {
    assert.equal(error.href, `#contact-${error.field}`);
    assert.ok(error.message.length > 0);
    assert.equal(error.code, 'required');
  }
});

test('validates email syntax and RFC-compatible length boundaries', () => {
  for (const email of ['amina', 'amina@', '@example.com', 'amina @example.com', 'a@b']) {
    const [error] = errorsFor(validPayload({ email }));
    assert.deepEqual({ field: error.field, code: error.code }, { field: 'email', code: 'invalid' });
  }

  const tooLong = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`;
  const [lengthError] = errorsFor(validPayload({ email: tooLong }));
  assert.deepEqual(
    { field: lengthError.field, code: lengthError.code },
    { field: 'email', code: 'too_long' },
  );
});

test('accepts only UAE mobile and landline numbering shapes', () => {
  for (const phone of [
    '+971511234567',
    '+971571234567',
    '+97181234567',
    '+97150123456',
    '+9715012345678',
    '+441234567890',
    '+971 50 CALL NOW',
  ]) {
    assert.equal(normalizeUaePhone(phone), null, phone);
    const [error] = errorsFor(validPayload({ phone }));
    assert.deepEqual({ field: error.field, code: error.code }, { field: 'phone', code: 'invalid' });
  }
});

test('rejects unknown subjects and requires affirmative consent', () => {
  const subjectError = errorsFor(validPayload({ subject: 'tax_advice' }))[0];
  assert.deepEqual(
    { field: subjectError.field, code: subjectError.code },
    { field: 'subject', code: 'invalid' },
  );

  const consentError = errorsFor(validPayload({ consent: false }))[0];
  assert.deepEqual(
    { field: consentError.field, code: consentError.code },
    { field: 'consent', code: 'required' },
  );
});

test('uses Unicode code-point length for name and message limits', () => {
  const astral = '\u{1F642}';
  assert.equal(
    expectValid(validPayload({ fullName: astral.repeat(CONTACT_LIMITS.fullNameMin) })).fullName,
    astral.repeat(2),
  );
  assert.equal(
    expectValid(validPayload({ message: astral.repeat(CONTACT_LIMITS.messageMin) })).message,
    astral.repeat(10),
  );

  for (const [field, payload] of [
    ['fullName', validPayload({ fullName: 'A' })],
    ['message', validPayload({ message: astral.repeat(CONTACT_LIMITS.messageMin - 1) })],
  ] as const) {
    const [error] = errorsFor(payload);
    assert.deepEqual({ field: error.field, code: error.code }, { field, code: 'too_short' });
  }

  for (const [field, payload] of [
    ['fullName', validPayload({ fullName: astral.repeat(CONTACT_LIMITS.fullNameMax + 1) })],
    ['message', validPayload({ message: astral.repeat(CONTACT_LIMITS.messageMax + 1) })],
    ['phone', validPayload({ phone: `+97150${'1'.repeat(CONTACT_LIMITS.phoneMax)}` })],
  ] as const) {
    const [error] = errorsFor(payload);
    assert.deepEqual({ field: error.field, code: error.code }, { field, code: 'too_long' });
  }
});
