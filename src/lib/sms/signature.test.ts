import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyTwilioSignature, verifyUnifonicSignature } from './signature';

const TWILIO_TOKEN = 'twilio_test_token';
const UNIFONIC_SECRET = 'unifonic_test_secret';

function twilioSig(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let payload = url;
  for (const k of keys) payload += k + params[k];
  return crypto.createHmac('sha1', TWILIO_TOKEN).update(payload).digest('base64');
}

test('verifyTwilioSignature: valid signature passes', () => {
  const url = 'https://app.example.com/api/v1/webhooks/twilio';
  const params = { MessageStatus: 'delivered', MessageSid: 'SM123', From: '+15005550006' };
  const sig = twilioSig(url, params);
  assert.equal(verifyTwilioSignature(url, params, sig, TWILIO_TOKEN), true);
});

test('verifyTwilioSignature: tampered URL fails', () => {
  const url = 'https://app.example.com/api/v1/webhooks/twilio';
  const params = { MessageStatus: 'delivered', MessageSid: 'SM123' };
  const sig = twilioSig(url, params);
  assert.equal(
    verifyTwilioSignature(
      'https://attacker.example.com/api/v1/webhooks/twilio',
      params,
      sig,
      TWILIO_TOKEN,
    ),
    false,
  );
});

test('verifyTwilioSignature: tampered params fail', () => {
  const url = 'https://app.example.com/api/v1/webhooks/twilio';
  const params = { MessageStatus: 'delivered', MessageSid: 'SM123' };
  const sig = twilioSig(url, params);
  assert.equal(
    verifyTwilioSignature(url, { ...params, MessageStatus: 'failed' }, sig, TWILIO_TOKEN),
    false,
  );
});

test('verifyTwilioSignature: missing header fails', () => {
  const url = 'https://app.example.com/api/v1/webhooks/twilio';
  assert.equal(verifyTwilioSignature(url, {}, null, TWILIO_TOKEN), false);
});

test('verifyUnifonicSignature: valid signature passes', () => {
  const body = '{"MessageID":"abc","Status":"Delivered"}';
  const sig = crypto.createHmac('sha256', UNIFONIC_SECRET).update(body).digest('hex');
  assert.equal(verifyUnifonicSignature(body, sig, UNIFONIC_SECRET), true);
});

test('verifyUnifonicSignature: tampered body fails', () => {
  const body = '{"MessageID":"abc","Status":"Delivered"}';
  const sig = crypto.createHmac('sha256', UNIFONIC_SECRET).update(body).digest('hex');
  assert.equal(verifyUnifonicSignature('{"x":1}', sig, UNIFONIC_SECRET), false);
});

test('verifyUnifonicSignature: missing header fails', () => {
  assert.equal(verifyUnifonicSignature('{}', null, UNIFONIC_SECRET), false);
});
