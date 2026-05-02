// Set env before any import that touches @/lib/env
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@/lib/errors';
import {
  assertStatusTransition,
  statusRequiresSessionRevoke,
  assertRoleChangeAllowed,
  type ProfileStatus,
} from './admin-edit-helpers';

const SELF = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';

describe('assertStatusTransition — accepts every allowed edge', () => {
  const cases: Array<[ProfileStatus, ProfileStatus]> = [
    ['active', 'suspended'],
    ['active', 'disabled'],
    ['suspended', 'active'],
    ['suspended', 'disabled'],
    ['invited', 'disabled'],
  ];
  for (const [from, to] of cases) {
    it(`${from} → ${to}`, () => {
      assert.doesNotThrow(() => assertStatusTransition(from, to));
    });
  }
});

describe('assertStatusTransition — rejects every disallowed edge', () => {
  const all: ProfileStatus[] = ['active', 'invited', 'disabled', 'suspended'];
  const allowed = new Set([
    'active->suspended',
    'active->disabled',
    'suspended->active',
    'suspended->disabled',
    'invited->disabled',
  ]);
  for (const from of all) {
    for (const to of all) {
      const key = `${from}->${to}`;
      if (allowed.has(key)) continue;
      it(`${from} → ${to} rejected`, () => {
        assert.throws(
          () => assertStatusTransition(from, to),
          (err: unknown) => err instanceof ApiError && err.code === 'INVALID_STATUS_TRANSITION',
        );
      });
    }
  }
});

describe('statusRequiresSessionRevoke', () => {
  it('suspended → revoke', () => {
    assert.equal(statusRequiresSessionRevoke('suspended'), true);
  });
  it('disabled → revoke', () => {
    assert.equal(statusRequiresSessionRevoke('disabled'), true);
  });
  it('active → no revoke', () => {
    assert.equal(statusRequiresSessionRevoke('active'), false);
  });
  it('invited → no revoke', () => {
    assert.equal(statusRequiresSessionRevoke('invited'), false);
  });
});

describe('assertRoleChangeAllowed — D2a self-demotion', () => {
  it('rejects when caller and target match', () => {
    assert.throws(
      () =>
        assertRoleChangeAllowed({
          callerId: SELF,
          callerRole: 'super_admin',
          targetId: SELF,
          targetRole: 'super_admin',
          newRole: 'admin',
          confirmation: 'DEMOTE',
          remainingSuperAdminsExcludingTarget: 5,
        }),
      (err: unknown) => err instanceof ApiError && err.code === 'SELF_DEMOTION',
    );
  });
});

describe('assertRoleChangeAllowed — D2b last super_admin', () => {
  it('rejects when no other super_admins remain', () => {
    assert.throws(
      () =>
        assertRoleChangeAllowed({
          callerId: SELF,
          callerRole: 'super_admin',
          targetId: TARGET,
          targetRole: 'super_admin',
          newRole: 'admin',
          confirmation: 'DEMOTE',
          remainingSuperAdminsExcludingTarget: 0,
        }),
      (err: unknown) => err instanceof ApiError && err.code === 'LAST_SUPER_ADMIN',
    );
  });

  it('allows when at least one other super_admin remains', () => {
    assert.doesNotThrow(() =>
      assertRoleChangeAllowed({
        callerId: SELF,
        callerRole: 'super_admin',
        targetId: TARGET,
        targetRole: 'super_admin',
        newRole: 'admin',
        confirmation: 'DEMOTE',
        remainingSuperAdminsExcludingTarget: 1,
      }),
    );
  });
});

describe('assertRoleChangeAllowed — D2c confirmation', () => {
  it('rejects super_admin demotion without DEMOTE confirmation', () => {
    assert.throws(
      () =>
        assertRoleChangeAllowed({
          callerId: SELF,
          callerRole: 'super_admin',
          targetId: TARGET,
          targetRole: 'super_admin',
          newRole: 'admin',
          remainingSuperAdminsExcludingTarget: 5,
        }),
      (err: unknown) => err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED',
    );
  });

  it('does not require confirmation for non-super_admin targets', () => {
    assert.doesNotThrow(() =>
      assertRoleChangeAllowed({
        callerId: SELF,
        callerRole: 'super_admin',
        targetId: TARGET,
        targetRole: 'pro',
        newRole: 'customer',
        remainingSuperAdminsExcludingTarget: 0,
      }),
    );
  });
});

describe('assertRoleChangeAllowed — super_admin promotion blocked', () => {
  it('rejects newRole=super_admin even from super_admin caller', () => {
    assert.throws(
      () =>
        assertRoleChangeAllowed({
          callerId: SELF,
          callerRole: 'super_admin',
          targetId: TARGET,
          targetRole: 'admin',
          newRole: 'super_admin' as never,
          remainingSuperAdminsExcludingTarget: 5,
        }),
      (err: unknown) => err instanceof ApiError && err.code === 'INVALID_ROLE_TRANSITION',
    );
  });
});

describe('assertRoleChangeAllowed — admin caller boundaries', () => {
  it('rejects admin caller promoting to admin', () => {
    assert.throws(
      () =>
        assertRoleChangeAllowed({
          callerId: SELF,
          callerRole: 'admin',
          targetId: TARGET,
          targetRole: 'pro',
          newRole: 'admin',
          remainingSuperAdminsExcludingTarget: 5,
        }),
      (err: unknown) => err instanceof ApiError && err.code === 'FORBIDDEN',
    );
  });

  it('rejects admin caller editing another admin', () => {
    assert.throws(
      () =>
        assertRoleChangeAllowed({
          callerId: SELF,
          callerRole: 'admin',
          targetId: TARGET,
          targetRole: 'admin',
          newRole: 'pro',
          remainingSuperAdminsExcludingTarget: 5,
        }),
      (err: unknown) => err instanceof ApiError && err.code === 'FORBIDDEN',
    );
  });

  it('allows admin caller demoting a pro to customer', () => {
    assert.doesNotThrow(() =>
      assertRoleChangeAllowed({
        callerId: SELF,
        callerRole: 'admin',
        targetId: TARGET,
        targetRole: 'pro',
        newRole: 'customer',
        remainingSuperAdminsExcludingTarget: 0,
      }),
    );
  });
});

describe('assertRoleChangeAllowed — no-op rejected', () => {
  it('rejects same-role transition', () => {
    assert.throws(
      () =>
        assertRoleChangeAllowed({
          callerId: SELF,
          callerRole: 'super_admin',
          targetId: TARGET,
          targetRole: 'pro',
          newRole: 'pro',
          remainingSuperAdminsExcludingTarget: 5,
        }),
      (err: unknown) => err instanceof ApiError && err.code === 'INVALID_ROLE_TRANSITION',
    );
  });
});
