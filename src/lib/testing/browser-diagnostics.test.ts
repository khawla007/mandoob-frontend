import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeBrowserDiagnostic } from './browser-diagnostics';

describe('sanitizeBrowserDiagnostic redaction variants', () => {
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

  it('redacts client secrets and common secret/key assignments without matching prose', () => {
    const output = sanitizeBrowserDiagnostic(
      '{"client_secret":"one","clientSecret":"two","private_key":"three","secretKey":"four"} client-secret=five',
    );

    for (const secret of ['one', 'two', 'three', 'four', 'five']) {
      assert.doesNotMatch(output, new RegExp(secret));
    }
    assert.equal(
      sanitizeBrowserDiagnostic(
        'The client secret rotation policy and private key guidance changed',
      ),
      'The client secret rotation policy and private key guidance changed',
    );
  });

  it('redacts complete Authorization values for arbitrary schemes', () => {
    const digest = sanitizeBrowserDiagnostic(
      'Authorization: Digest username="user", realm="private", response="digest-secret"',
    );
    const aws = sanitizeBrowserDiagnostic(
      'AUTHORIZATION: AWS4-HMAC-SHA256 Credential=access/region, Signature=aws-secret',
    );

    assert.equal(digest, 'Authorization: [REDACTED]');
    assert.equal(aws, 'Authorization: [REDACTED]');
  });

  it('redacts bearer, cookie, and query credentials', () => {
    const output = sanitizeBrowserDiagnostic(
      'Bearer abc.def? access_token=plain&refresh_token=url%2Bencoded%2Fsecret&id_token=identity\n' +
        'Cookie: session=session-secret; preference=compact',
    );

    assert.doesNotMatch(output, /abc\.def|plain|url%2Bencoded|identity|session-secret/);
    assert.match(output, /Cookie: \[REDACTED\]/);
  });

  it('redacts chained percent-encoded password, API key, and client secret forms', () => {
    const output = sanitizeBrowserDiagnostic(
      'password%3Done%26api%5Fkey%3Dtwo%26client%5Fsecret%3Dthree%26access%5Ftoken%3Dfour',
    );

    for (const secret of ['one', 'two', 'three', 'four']) {
      assert.doesNotMatch(output, new RegExp(secret));
    }
    assert.equal(
      output,
      'password%3D[REDACTED]%26api%5Fkey%3D[REDACTED]%26client%5Fsecret%3D[REDACTED]%26access%5Ftoken%3D[REDACTED]',
    );
  });

  it('preserves useful ordinary diagnostics and truncates long output', () => {
    const ordinary = 'Session list failed because password policy metadata was unavailable';
    assert.equal(sanitizeBrowserDiagnostic(ordinary), ordinary);
    assert.equal(sanitizeBrowserDiagnostic('x'.repeat(800)).length, 500);
  });
});
