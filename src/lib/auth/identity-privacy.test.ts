import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('auth event details never retain email addresses or raw provider errors', () => {
  const files = [
    'src/app/api/v1/auth/login/route.ts',
    'src/app/api/v1/auth/register/route.ts',
    'src/app/api/v1/auth/forgot-password/route.ts',
    'src/app/api/v1/auth/invite/create/route.ts',
    'src/app/api/v1/auth/invite/accept/route.ts',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /details:\s*\{[^}]*\bemail\s*:/iu, file);
    assert.doesNotMatch(source, /errorResponse\([^\n]*,\s*(?:\w+Err|error)\??\.message/iu, file);
  }
});

test('account actions map provider failures to fixed safe messages', () => {
  const source = read('src/app/account/actions.ts');
  assert.doesNotMatch(source, /message:\s*(?:updateErr|error|chErr|vErr)\?*\.message/iu);
  assert.doesNotMatch(source, /console\.error\('account action failed',\s*e\)/u);
});

test('invitation creation uses fresh authority and never returns the bearer token URL', () => {
  const source = read('src/app/api/v1/auth/invite/create/route.ts');
  assert.match(source, /getAuthoritativeSessionProfile/u);
  assert.match(source, /resolveInviteTenant/u);
  assert.doesNotMatch(source, /return jsonOk\(\{ ok: true, inviteUrl \}/u);
});
