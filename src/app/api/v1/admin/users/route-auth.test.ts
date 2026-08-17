import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('admin user mutation uses the live platform-operator guard before service-role mutation', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/users/route.ts'), 'utf8');
  assert.match(source, /requirePlatformOperator\(\)/u);
  assert.equal(source.includes("requireRole('super_admin', 'admin')"), false);
  assert.ok(source.indexOf('requirePlatformOperator()') < source.indexOf('adminCreateUser('));
});

test('admin user APIs never return unexpected provider error messages', () => {
  for (const file of [
    'src/app/api/v1/admin/users/route.ts',
    'src/app/api/v1/admin/users/[id]/route.ts',
    'src/app/api/v1/admin/users/[id]/role/route.ts',
    'src/app/api/v1/admin/users/[id]/status/route.ts',
    'src/app/api/v1/admin/users/[id]/mfa-reset/route.ts',
  ]) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    assert.doesNotMatch(
      source,
      /errorResponse\('INTERNAL',\s*e instanceof Error \? e\.message/u,
      file,
    );
  }

  for (const file of [
    'src/lib/data/admin-create-user.ts',
    'src/lib/data/admin-read-user.ts',
    'src/lib/data/admin-edit-user.ts',
    'src/lib/data/admin-change-role.ts',
    'src/lib/data/admin-change-status.ts',
    'src/lib/data/admin-reset-mfa.ts',
  ]) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    assert.doesNotMatch(
      source,
      /new ApiError\([\s\S]{0,120}(?:readErr|profileErr|updErr|factorsErr|delErr|inviteErr|error)\.message/u,
      file,
    );
  }
});

test('credential verification requires CSRF, live operator AAL2, and per-actor rate limiting', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/api/v1/admin/users/[id]/credentials/route.ts'),
    'utf8',
  );
  for (const marker of [
    'guardCsrf(request)',
    'requirePlatformOperator()',
    "session.aal !== 'aal2'",
    'consumeRateLimit({',
    'expectedUpdatedAt',
  ]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.ok(source.indexOf('consumeRateLimit({') < source.indexOf('verifyProCredentials('));
});
