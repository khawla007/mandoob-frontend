import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProfileBaseSchema,
  ProfilePhoneSchema,
  PasswordChangeSchema,
  MfaEnrollFinalizeSchema,
  RoleProSchema,
  RoleCustomerSchema,
  RoleEmployeeSchema,
} from './account';

test('ProfileBaseSchema accepts trimmed display_name', () => {
  const r = ProfileBaseSchema.safeParse({ display_name: '  Khawla A  ' });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.display_name, 'Khawla A');
});

test('ProfileBaseSchema rejects too-short display_name', () => {
  const r = ProfileBaseSchema.safeParse({ display_name: 'a' });
  assert.equal(r.success, false);
});

test('ProfilePhoneSchema accepts E.164', () => {
  const r = ProfilePhoneSchema.safeParse({ display_name: 'Bob', phone: '+971501234567' });
  assert.equal(r.success, true);
});

test('ProfilePhoneSchema rejects malformed phone', () => {
  const r = ProfilePhoneSchema.safeParse({ display_name: 'Bob', phone: '0501234567' });
  assert.equal(r.success, false);
});

test('PasswordChangeSchema rejects mismatched confirm', () => {
  const r = PasswordChangeSchema.safeParse({
    current_password: 'old',
    new_password: 'Newpass1234',
    confirm_password: 'Newpass9999',
  });
  assert.equal(r.success, false);
});

test('PasswordChangeSchema rejects weak new_password', () => {
  const r = PasswordChangeSchema.safeParse({
    current_password: 'old',
    new_password: 'short1A',
    confirm_password: 'short1A',
  });
  assert.equal(r.success, false);
});

test('MfaEnrollFinalizeSchema rejects 5-digit code', () => {
  const r = MfaEnrollFinalizeSchema.safeParse({
    factor_id: '00000000-0000-0000-0000-000000000001',
    code: '12345',
  });
  assert.equal(r.success, false);
});

test('RoleProSchema accepts empty service_areas', () => {
  const r = RoleProSchema.safeParse({ service_areas: [] });
  assert.equal(r.success, true);
});

test('RoleProSchema caps bio at 500 chars', () => {
  const r = RoleProSchema.safeParse({ service_areas: [], bio: 'x'.repeat(501) });
  assert.equal(r.success, false);
});

test('RoleCustomerSchema requires uppercase ISO-3166', () => {
  const r = RoleCustomerSchema.safeParse({ nationality: 'ae' });
  assert.equal(r.success, false);
});

test('RoleEmployeeSchema rejects employer-managed visa fields', () => {
  const r = RoleEmployeeSchema.safeParse({
    passport_no: 'AB1234567',
    visa_no: 'should-be-rejected',
  });
  assert.equal(r.success, false);
});

test('RoleEmployeeSchema accepts passport_no alone', () => {
  const r = RoleEmployeeSchema.safeParse({ passport_no: 'AB1234567' });
  assert.equal(r.success, true);
});
