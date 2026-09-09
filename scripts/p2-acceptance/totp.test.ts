import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateTotp } from './totp';

describe('P2.12 TOTP helper', () => {
  it('matches RFC 6238 SHA-1 vectors without logging or persisting the secret', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    assert.equal(generateTotp(secret, 59_000, 8), '94287082');
    assert.equal(generateTotp(secret, 1_111_111_109_000, 8), '07081804');
  });
});
