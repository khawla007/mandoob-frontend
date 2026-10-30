import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as schemas from './tenant-settings';
const { brandingSchema, contactSchema, smtpSchema, whatsappSchema } = schemas;

test('settings URLs enforce the database length and authority subset before mutation', () => {
  const input = {
    name: 'Acme',
    logo_url: '',
    favicon_url: '',
    primary_color: '',
    secondary_color: '',
  };
  for (const logo_url of [
    'https://example.com/' + 'x'.repeat(2048),
    'HTTPS://example.com',
    'https://bad_host.com',
    'https://-bad.example',
    'https://example.com.',
    'https://' + 'a'.repeat(64) + '.com',
    'https://' + Array(5).fill('a'.repeat(60)).join('.'),
    'https://127.1',
    'https://256.1.1.1',
    'https://example.com:00000080',
    'https://example.com:0',
    'https://example.com:65536',
    'https://user:pass@example.com',
    'https://[fe80::1%25eth0]/',
    'https://example.com/a\\b',
    'https://example.com/a\u0000',
  ]) {
    assert.equal(
      brandingSchema.safeParse({ ...input, logo_url }).success,
      false,
      logo_url.slice(0, 80),
    );
  }
  for (const logo_url of [
    'http://localhost:1/',
    'https://example.com:65535/a?b=c#d',
    'https://127.0.0.1/',
    'https://[2001:db8::1]:443/',
    'https://xn--bcher-kva.example/',
    'https://example.123/',
  ])
    assert.equal(brandingSchema.safeParse({ ...input, logo_url }).success, true, logo_url);
});

test('contact and SMTP emails reject more than 254 characters', () => {
  const email = 'a'.repeat(60) + '@' + Array(4).fill('b'.repeat(60)).join('.') + '.com';
  assert.equal(
    contactSchema.safeParse({
      email_sender_name: '',
      email_reply_to: email,
      terms_url: '',
      privacy_url: '',
    }).success,
    false,
  );
  assert.equal(
    smtpSchema.safeParse({
      host: 'smtp.example.com',
      port: 587,
      username: 'u',
      from_address: email,
      enabled: true,
    }).success,
    false,
  );
});

test('SMTP host matches the database ASCII hostname character contract', () => {
  for (const host of [
    'bad host',
    'bad/host',
    '_smtp.example.com',
    'smtp@example.com',
    '-smtp.example.com',
    'smtp\u0000.example.com',
  ])
    assert.equal(
      smtpSchema.safeParse({
        host,
        port: 587,
        username: 'u',
        from_address: 'a@b.co',
        enabled: true,
      }).success,
      false,
      host,
    );
});

test('settings operations require a UUID and a safe nonnegative integer version', () => {
  const schema = schemas.settingsOperationSchema;
  assert.ok(schema);
  for (const input of [
    {},
    { operation_id: 'invalid', expected_version: 0 },
    { operation_id: '11111111-1111-4111-8111-111111111111', expected_version: -1 },
    { operation_id: '11111111-1111-4111-8111-111111111111', expected_version: '0' },
  ])
    assert.equal(schema.safeParse(input).success, false);
});

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

test('brandingSchema rejects an incomplete section instead of clearing omitted fields', () => {
  const r = brandingSchema.safeParse({});
  assert.equal(r.success, false);
});

test('contactSchema rejects incomplete sections', () => {
  assert.equal(contactSchema.safeParse({}).success, false);
});

test('branding URLs require well-formed HTTP(S) URLs with a host', () => {
  for (const logo_url of [
    'javascript:alert(1)',
    'https:example.com',
    'https:///example.com',
    'ftp://example.com',
  ]) {
    assert.equal(
      brandingSchema.safeParse({
        name: 'Acme',
        logo_url,
        favicon_url: '',
        primary_color: '',
        secondary_color: '',
      }).success,
      false,
      logo_url,
    );
  }
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

test('whatsappSchema accepts Meta ids and first-save access token', () => {
  const r = whatsappSchema.safeParse({
    business_account_id: '123456789012345',
    phone_number_id: '987654321098765',
    access_token: 'EAABValidLongTokenValue',
    enabled: true,
    has_existing_token: false,
  });
  assert.equal(r.success, true);
});

test('whatsappSchema leaves the credential prerequisite to the authoritative database', () => {
  const r = whatsappSchema.safeParse({
    business_account_id: '123456789012345',
    phone_number_id: '987654321098765',
    access_token: '',
    enabled: true,
    has_existing_token: false,
  });
  assert.equal(r.success, true);
});

test('whatsappSchema allows blank token when existing token is retained', () => {
  const r = whatsappSchema.safeParse({
    business_account_id: '123456789012345',
    phone_number_id: '987654321098765',
    access_token: '',
    enabled: false,
    has_existing_token: true,
  });
  assert.equal(r.success, true);
});
