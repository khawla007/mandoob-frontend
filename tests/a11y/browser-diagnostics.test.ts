import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeBrowserDiagnostic } from './browser-diagnostics';

describe('sanitizeBrowserDiagnostic', () => {
  it('redacts structured secrets regardless of key style or case', () => {
    const input =
      '{"token":"secret-token","PASSWORD":"secret-password","apiKey":"secret-api","serviceRoleKey":"secret-role","access_token":"secret-access","refresh_token":"secret-refresh","id_token":"secret-id","cookie":"secret-cookie","session":"secret-session","Authorization":"Basic secret-auth"}';
    const output = sanitizeBrowserDiagnostic(input);

    for (const secret of [
      'secret-token',
      'secret-password',
      'secret-api',
      'secret-role',
      'secret-access',
      'secret-refresh',
      'secret-id',
      'secret-cookie',
      'secret-session',
      'secret-auth',
    ]) {
      assert.doesNotMatch(output, new RegExp(secret));
    }
    assert.match(output, /"token":"\[REDACTED\]"/);
  });

  it('redacts bearer credentials and query parameters including URL-encoded values', () => {
    const output = sanitizeBrowserDiagnostic(
      'Bearer abc.def? access_token=plain&refresh_token=url%2Bencoded%2Fsecret&id_token=identity',
    );

    assert.equal(
      output,
      'Bearer [REDACTED] access_token=[REDACTED]&refresh_token=[REDACTED]&id_token=[REDACTED]',
    );
  });

  it('redacts authorization and cookie headers plus percent-encoded credential keys', () => {
    const output = sanitizeBrowserDiagnostic(
      'Authorization: Basic basic-secret; Cookie: session=session-secret; preference=compact\n' +
        'access%5Ftoken%3Dencoded-secret%26refresh_token%3Dsecond-secret',
    );

    assert.doesNotMatch(output, /basic-secret|session-secret|encoded-secret|second-secret/);
    assert.match(output, /Authorization: \[REDACTED\]/);
    assert.match(output, /Cookie: \[REDACTED\]/);
    assert.match(output, /access%5Ftoken%3D\[REDACTED\]/i);
  });

  it('preserves useful ordinary diagnostics and truncates long output', () => {
    const ordinary = 'Session list failed because password policy metadata was unavailable';
    assert.equal(sanitizeBrowserDiagnostic(ordinary), ordinary);
    assert.equal(sanitizeBrowserDiagnostic('x'.repeat(800)).length, 500);
  });
});
