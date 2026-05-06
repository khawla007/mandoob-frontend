import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTwilioError } from './providers/twilio';
import { mapUnifonicError } from './providers/unifonic';

test('mapTwilioError: 5xx is retryable', () => {
  const r = mapTwilioError(503, { code: 30003, message: 'unreachable' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, true);
});

test('mapTwilioError: 429 is retryable', () => {
  const r = mapTwilioError(429, { code: 20429, message: 'too many' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, true);
});

test('mapTwilioError: 401 auth is non-retryable', () => {
  const r = mapTwilioError(401, { code: 20003, message: 'auth required' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, false);
});

test('mapTwilioError: 400 invalid To is non-retryable', () => {
  const r = mapTwilioError(400, { code: 21211, message: 'invalid "To" parameter' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, false);
});

test('mapTwilioError: missing payload still returns string', () => {
  const r = mapTwilioError(500, null);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.retryable, true);
    assert.match(r.error, /Twilio HTTP 500/);
  }
});

test('mapUnifonicError: 5xx is retryable', () => {
  const r = mapUnifonicError(502, { errorCode: 999, message: 'gateway' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, true);
});

test('mapUnifonicError: 401 is non-retryable', () => {
  const r = mapUnifonicError(401, { errorCode: 110, message: 'invalid AppSid' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, false);
});

test('mapUnifonicError: 400 invalid recipient is non-retryable', () => {
  const r = mapUnifonicError(400, { errorCode: 50, message: 'invalid Recipient' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, false);
});
