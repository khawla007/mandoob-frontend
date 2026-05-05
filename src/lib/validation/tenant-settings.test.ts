import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandingSchema, contactSchema, smtpSchema } from './tenant-settings';

test('brandingSchema accepts hex colors and URLs', () => {
  const r = brandingSchema.safeParse({
    name: 'Acme PRO',
    logo_url: 'https://cdn.example.com/logo.svg',
    favicon_url: '',
    primary_color: '#4f46e5',
    secondary_color: '',
  });
  assert.equal(r.success, true);
});

test('brandingSchema rejects malformed hex color', () => {
  const r = brandingSchema.safeParse({ primary_color: 'rebeccapurple' });
  assert.equal(r.success, false);
});

test('brandingSchema accepts empty optional fields', () => {
  const r = brandingSchema.safeParse({});
  assert.equal(r.success, true);
});

test('contactSchema accepts a valid email and URLs', () => {
  const r = contactSchema.safeParse({
    email_sender_name: 'Acme PRO',
    email_reply_to: 'hello@acmepro.ae',
    terms_url: 'https://acmepro.ae/terms',
    privacy_url: '',
  });
  assert.equal(r.success, true);
});

test('contactSchema rejects bad email', () => {
  const r = contactSchema.safeParse({ email_reply_to: 'not-an-email' });
  assert.equal(r.success, false);
});

test('smtpSchema requires host, username, from_address', () => {
  const r = smtpSchema.safeParse({
    host: 'smtp.example.com',
    port: 587,
    username: 'apikey',
    password: 'secret',
    from_address: 'no-reply@acmepro.ae',
    enabled: true,
  });
  assert.equal(r.success, true);
});

test('smtpSchema coerces string port', () => {
  const r = smtpSchema.safeParse({
    host: 'smtp.example.com',
    port: '465',
    username: 'u',
    from_address: 'a@b.co',
    enabled: false,
  });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.port, 465);
});

test('smtpSchema rejects port out of range', () => {
  const r = smtpSchema.safeParse({
    host: 'smtp.example.com',
    port: 70000,
    username: 'u',
    from_address: 'a@b.co',
    enabled: true,
  });
  assert.equal(r.success, false);
});

test('smtpSchema treats empty password as unset (kept on update)', () => {
  const r = smtpSchema.safeParse({
    host: 'smtp.example.com',
    port: 587,
    username: 'u',
    password: '',
    from_address: 'a@b.co',
    enabled: true,
  });
  assert.equal(r.success, true);
});
