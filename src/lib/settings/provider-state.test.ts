import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveProviderState, type RedactedProviderConfig } from './provider-state';

test('provider state only reports enabled when a source-backed credential is present', () => {
  const config: RedactedProviderConfig = { enabled: true, hasCredential: true };
  assert.equal(deriveProviderState({ status: 'ready', data: config }), 'enabled');
});

test('provider state keeps a disabled complete configuration distinct from enabled', () => {
  const config: RedactedProviderConfig = { enabled: false, hasCredential: true };
  assert.equal(deriveProviderState({ status: 'ready', data: config }), 'configured');
});

test('provider state labels an enabled row without a credential as misconfigured', () => {
  const config: RedactedProviderConfig = { enabled: true, hasCredential: false };
  assert.equal(deriveProviderState({ status: 'ready', data: config }), 'misconfigured');
});

test('provider source failures remain unavailable instead of appearing unconfigured', () => {
  assert.equal(deriveProviderState({ status: 'unavailable' }), 'unavailable');
});

test('provider state identifies an absent source row as not configured', () => {
  assert.equal(deriveProviderState({ status: 'ready', data: null }), 'not_configured');
});
