import assert from 'node:assert/strict';
import test from 'node:test';

import { isExplicitLocalAcceptanceOrigin } from './local-acceptance-origin';

test('accepts only the exact P3.13 loopback production origin with explicit opt-in', () => {
  assert.equal(
    isExplicitLocalAcceptanceOrigin({
      P3_13_ACCEPTANCE_LOCAL_ONLY: '1',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3113',
    }),
    true,
  );
  for (const env of [
    { NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3113' },
    { P3_13_ACCEPTANCE_LOCAL_ONLY: 'true', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3113' },
    { P3_13_ACCEPTANCE_LOCAL_ONLY: '1', NEXT_PUBLIC_APP_URL: 'http://localhost:3113' },
    { P3_13_ACCEPTANCE_LOCAL_ONLY: '1', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100' },
    { P3_13_ACCEPTANCE_LOCAL_ONLY: '1', NEXT_PUBLIC_APP_URL: 'https://127.0.0.1:3113' },
    { P3_13_ACCEPTANCE_LOCAL_ONLY: '1', NEXT_PUBLIC_APP_URL: 'http://127.0.0.2:3113' },
  ]) {
    assert.equal(isExplicitLocalAcceptanceOrigin(env), false);
  }
});

test('does not broaden the existing P1.12 and P2 exact exceptions', () => {
  assert.equal(
    isExplicitLocalAcceptanceOrigin({
      P112_ACCEPTANCE_LOCAL_ONLY: '1',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3001',
    }),
    true,
  );
  assert.equal(
    isExplicitLocalAcceptanceOrigin({
      P2_ACCEPTANCE_LOCAL_ONLY: '1',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
    }),
    true,
  );
  assert.equal(
    isExplicitLocalAcceptanceOrigin({
      P2_ACCEPTANCE_LOCAL_ONLY: '1',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3113',
    }),
    false,
  );
});
