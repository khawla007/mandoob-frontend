import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickProvider, InvalidPhoneError, NoProviderConfiguredError } from './router';

const both = { unifonic: true, twilio: true };

test('pickProvider: +971 → unifonic when both configured', () => {
  assert.equal(pickProvider('+971501234567', both), 'unifonic');
});

test('pickProvider: +1 → twilio when both configured', () => {
  assert.equal(pickProvider('+14155551212', both), 'twilio');
});

test('pickProvider: +44 → twilio when both configured', () => {
  assert.equal(pickProvider('+447700900123', both), 'twilio');
});

test('pickProvider: only unifonic configured → unifonic for any country', () => {
  assert.equal(pickProvider('+14155551212', { unifonic: true, twilio: false }), 'unifonic');
});

test('pickProvider: only twilio configured → twilio for +971', () => {
  assert.equal(pickProvider('+971501234567', { unifonic: false, twilio: true }), 'twilio');
});

test('pickProvider: invalid phone throws', () => {
  assert.throws(() => pickProvider('971501234567', both), InvalidPhoneError);
  assert.throws(() => pickProvider('+0123', both), InvalidPhoneError);
  assert.throws(() => pickProvider('not-a-phone', both), InvalidPhoneError);
});

test('pickProvider: no provider configured throws', () => {
  assert.throws(
    () => pickProvider('+971501234567', { unifonic: false, twilio: false }),
    NoProviderConfiguredError,
  );
});
