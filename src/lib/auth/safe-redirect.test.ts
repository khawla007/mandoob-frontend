import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedSafeDestination } from './safe-redirect';

test('allows only normalized application destination families', () => {
  const approved = [
    '/',
    '/admin',
    '/admin/users',
    '/account',
    '/apply/renewal',
    '/company-setup/profile',
    '/estimate/new',
    '/knowledge-base/articles',
    '/pricing',
    '/pro/dashboard',
    '/reset-password',
    '/t/acme',
    '/t/acme-co/portal/documents',
  ];

  for (const destination of approved) {
    assert.equal(sharedSafeDestination(destination), destination, destination);
  }
});

test('strips query and hash state rather than carrying unapproved context', () => {
  assert.equal(sharedSafeDestination('/admin?tab=users#invite'), '/admin');
  assert.equal(sharedSafeDestination('/t/acme/portal?invoice=123'), '/t/acme/portal');
});

test('falls back for external, credential-bearing, and scheme-relative URLs', () => {
  const rejected = [
    'https://evil.example/admin',
    'http://evil.example/admin',
    'https://user:password@evil.example/',
    '//evil.example/admin',
    '//user:password@evil.example/admin',
  ];

  for (const destination of rejected) {
    assert.equal(sharedSafeDestination(destination), '/', destination);
  }
});

test('falls back for backslash and encoded redirect confusion', () => {
  const rejected = [
    '/\\evil.example',
    '\\evil.example\\admin',
    '/%5cevil.example',
    '/%255cevil.example',
    '/%25255cevil.example',
    '/%2f%2fevil.example',
    '/%252f%252fevil.example',
    '/admin%2f..%2flogin',
  ];

  for (const destination of rejected) {
    assert.equal(sharedSafeDestination(destination), '/', destination);
  }
});

test('falls back for whitespace, controls, and malformed encoding', () => {
  const rejected = [
    ' /admin',
    '/admin ',
    '/ad min',
    '/admin\n/users',
    '/admin\u0000/users',
    '/admin%ZZ',
    '/admin%',
  ];

  for (const destination of rejected) {
    assert.equal(sharedSafeDestination(destination), '/', JSON.stringify(destination));
  }
});

test('falls back for non-normalized and unsupported paths', () => {
  const rejected = [
    '',
    'admin',
    '///admin',
    '/admin/',
    '/admin//users',
    '/admin/../account',
    '/contact',
    '/api/v1/users',
    '/_next/static/file.js',
    '/t',
    '/t/',
    '/t/Acme',
    '/t/-acme',
    '/t/acme_',
    '/t/acme--co',
  ];

  for (const destination of rejected) {
    assert.equal(sharedSafeDestination(destination), '/', destination);
  }
});

test('falls back for authentication loops', () => {
  const rejected = [
    '/login',
    '/signin',
    '/register',
    '/callback',
    '/mfa',
    '/mfa/challenge',
    '/verify-otp',
    '/forgot-password',
  ];

  for (const destination of rejected) {
    assert.equal(sharedSafeDestination(destination), '/', destination);
  }
});

test('allows only the exact password-reset callback destination', () => {
  assert.equal(sharedSafeDestination('/reset-password'), '/reset-password');
  assert.equal(sharedSafeDestination('/reset-password/confirm'), '/');
  assert.equal(sharedSafeDestination('/reset-password?token=secret'), '/');
  assert.equal(sharedSafeDestination('/reset-password#token'), '/');
});
