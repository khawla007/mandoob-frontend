import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactMeetingTranscript, transcriptRetentionDeadline } from './privacy';

test('transcript redaction removes direct contact and UAE identity values', () => {
  const redacted = redactMeetingTranscript(
    'Email person@example.com or +971 50 123 4567. Emirates ID 784-1990-1234567-1.',
  );
  assert.equal(redacted.includes('person@example.com'), false);
  assert.equal(redacted.includes('+971 50 123 4567'), false);
  assert.equal(redacted.includes('784-1990-1234567-1'), false);
  assert.match(redacted, /\[EMAIL_REDACTED\]/u);
  assert.match(redacted, /\[PHONE_REDACTED\]/u);
  assert.match(redacted, /\[UAE_ID_REDACTED\]/u);
});

test('transcript retention is bounded to thirty days', () => {
  assert.equal(
    transcriptRetentionDeadline(new Date('2026-10-27T00:00:00.000Z')),
    '2026-11-26T00:00:00.000Z',
  );
});
