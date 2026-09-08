import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { trustedApplicationUrl } from './trusted-app-origin';

test('builds redirects from the configured application origin only', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.mandoob.test/deployment-path?ignored=1';

  try {
    assert.equal(
      trustedApplicationUrl('/admin').href,
      'https://app.mandoob.test/admin',
      'an attacker-controlled request Host is not an input to redirect construction',
    );
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
});

test('uses the fixed local development origin when configuration is unavailable or invalid', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;

  try {
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(trustedApplicationUrl('/').href, 'http://localhost:3001/');

    process.env.NEXT_PUBLIC_APP_URL = 'javascript:alert(1)';
    assert.equal(trustedApplicationUrl('/').href, 'http://localhost:3001/');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
});

test('fails closed for missing or invalid application origin in production', () => {
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    Object.defineProperty(process.env, 'NODE_ENV', {
      configurable: true,
      enumerable: true,
      value: 'production',
      writable: true,
    });
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.throws(() => trustedApplicationUrl('/'), /NEXT_PUBLIC_APP_URL/u);

    process.env.NEXT_PUBLIC_APP_URL = 'javascript:alert(1)';
    assert.throws(() => trustedApplicationUrl('/'), /NEXT_PUBLIC_APP_URL/u);

    process.env.NEXT_PUBLIC_APP_URL = 'http://app.mandoob.test';
    assert.throws(() => trustedApplicationUrl('/'), /NEXT_PUBLIC_APP_URL/u);

    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3001';
    assert.throws(() => trustedApplicationUrl('/'), /NEXT_PUBLIC_APP_URL/u);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousUrl;
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else {
      Object.defineProperty(process.env, 'NODE_ENV', {
        configurable: true,
        enumerable: true,
        value: previousNodeEnv,
        writable: true,
      });
    }
  }
});

test('allows HTTP only for a non-production loopback origin', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;

  try {
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3001';
    assert.equal(trustedApplicationUrl('/account').href, 'http://127.0.0.1:3001/account');

    process.env.NEXT_PUBLIC_APP_URL = 'http://app.mandoob.test';
    assert.equal(trustedApplicationUrl('/account').href, 'http://localhost:3001/account');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
});

test('documents and validates the configured application origin', () => {
  const example = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
  const envContract = readFileSync(new URL('../env.ts', import.meta.url), 'utf8');

  assert.match(example, /^NEXT_PUBLIC_APP_URL=/mu);
  assert.match(envContract, /NEXT_PUBLIC_APP_URL:/u);
});
