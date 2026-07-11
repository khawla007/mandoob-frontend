// Set env before any import that touches @/lib/env
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@/lib/errors';
import { assertLastAdminInvariant } from './tenant-admin-invariants.pure';

describe('assertLastAdminInvariant', () => {
  it('passes when target stays an active admin', () => {
    assert.doesNotThrow(() =>
      assertLastAdminInvariant({
        remainingActiveAdminsExcludingTarget: 0,
        targetWillBeActiveAdminAfter: true,
      }),
    );
  });

  it('passes when at least one other active admin remains', () => {
    assert.doesNotThrow(() =>
      assertLastAdminInvariant({
        remainingActiveAdminsExcludingTarget: 1,
        targetWillBeActiveAdminAfter: false,
      }),
    );
  });

  it('throws LAST_ADMIN_GUARD when removing the last active admin', () => {
    try {
      assertLastAdminInvariant({
        remainingActiveAdminsExcludingTarget: 0,
        targetWillBeActiveAdminAfter: false,
      });
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e instanceof ApiError);
      assert.equal((e as ApiError).code, 'LAST_ADMIN_GUARD');
      assert.equal((e as ApiError).status, 400);
    }
  });

  it('throws even when remaining count is negative (defensive)', () => {
    try {
      assertLastAdminInvariant({
        remainingActiveAdminsExcludingTarget: -1,
        targetWillBeActiveAdminAfter: false,
      });
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e instanceof ApiError);
      assert.equal((e as ApiError).code, 'LAST_ADMIN_GUARD');
    }
  });

  it('passes when many other admins exist and target stays admin', () => {
    assert.doesNotThrow(() =>
      assertLastAdminInvariant({
        remainingActiveAdminsExcludingTarget: 5,
        targetWillBeActiveAdminAfter: true,
      }),
    );
  });

  it('passes when many other admins exist and target leaves the role', () => {
    assert.doesNotThrow(() =>
      assertLastAdminInvariant({
        remainingActiveAdminsExcludingTarget: 5,
        targetWillBeActiveAdminAfter: false,
      }),
    );
  });
});
