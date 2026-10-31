import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const unavailable = async () => 'unavailable' as const;

function loadUnavailableRoute(file: string) {
  let downstreamCalls = 0;
  const downstream = () => {
    downstreamCalls += 1;
    throw new Error('downstream work must not run');
  };
  const fallbackModule = new Proxy<Record<string, unknown>>({}, { get: () => downstream });
  const requireModule = (specifier: string) => {
    if (specifier === 'zod') return { z };
    if (specifier === '@/lib/auth/csrf-guard') return { guardCsrf: async () => null };
    if (specifier === '@/lib/auth/request') {
      return {
        getClientIp: () => '127.0.0.1',
        getUserAgent: () => 'test-agent',
        parseJson: downstream,
      };
    }
    if (specifier === '@/lib/rate-limit') {
      return {
        consumeRateLimitDecision: unavailable,
        RATE_LIMITS: {
          authLoginIp: { capacity: 10, refillPerSec: 10 / 60 },
          authPublicIp: { capacity: 20, refillPerSec: 20 / 60 },
        },
      };
    }
    if (specifier === '@/lib/errors') {
      return {
        errorResponse: (code: string, error: string, status: number) =>
          new Response(JSON.stringify({ error, code }), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        jsonOk: downstream,
      };
    }
    return fallbackModule;
  };
  const source = readFileSync(join(process.cwd(), file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  const testModule = { exports: {} as Record<string, unknown> };
  const wrapper = vm.runInNewContext(`(function (exports, require, module) { ${compiled}\n })`, {
    Buffer,
    Request,
    Response,
    console,
    crypto,
  }) as (
    exports: Record<string, unknown>,
    require: (specifier: string) => unknown,
    module: { exports: Record<string, unknown> },
  ) => void;
  wrapper(testModule.exports, requireModule, testModule);
  return {
    POST: testModule.exports.POST as (request: Request) => Promise<Response>,
    downstreamCalls: () => downstreamCalls,
  };
}

async function assertUnavailable(response: Response) {
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    code: 'RATE_LIMIT_UNAVAILABLE',
    error: 'Request protection is temporarily unavailable.',
  });
}

test('login returns stable 503 without starting lockout or authentication work', async () => {
  const route = loadUnavailableRoute('src/app/api/v1/auth/login/route.ts');
  const response = await route.POST(
    new Request('https://localhost:3001/api/v1/auth/login', { method: 'POST' }),
  );
  await assertUnavailable(response);
  assert.equal(route.downstreamCalls(), 0);
});

test('registration returns stable 503 without creating an auth provider client', async () => {
  const route = loadUnavailableRoute('src/app/api/v1/auth/register/route.ts');
  const response = await route.POST(
    new Request('https://localhost:3001/api/v1/auth/register', { method: 'POST' }),
  );
  await assertUnavailable(response);
  assert.equal(route.downstreamCalls(), 0);
});

test('password reset returns stable 503 without loading the auth provider', async () => {
  const route = loadUnavailableRoute('src/app/api/v1/auth/reset-password/route.ts');
  const response = await route.POST(
    new Request('https://localhost:3001/api/v1/auth/reset-password', { method: 'POST' }),
  );
  await assertUnavailable(response);
  assert.equal(route.downstreamCalls(), 0);
});

test('estimate PDF returns stable 503 without querying estimator cost rows', async () => {
  const route = loadUnavailableRoute('src/app/api/v1/public/estimate/pdf/route.ts');
  const response = await route.POST(
    new Request('https://localhost:3001/api/v1/public/estimate/pdf', { method: 'POST' }),
  );
  await assertUnavailable(response);
  assert.equal(route.downstreamCalls(), 0);
});

for (const [name, file] of [
  ['enrollment', 'src/app/api/v1/auth/mfa/enroll/route.ts'],
  ['recovery', 'src/app/api/v1/auth/mfa/recovery/route.ts'],
  ['verification', 'src/app/api/v1/auth/mfa/verify/route.ts'],
] as const) {
  test(`MFA ${name} returns stable 503 before session or provider work`, async () => {
    const route = loadUnavailableRoute(file);
    const response = await route.POST(
      new Request(`https://localhost:3001/api/v1/auth/mfa/${name}`, { method: 'POST' }),
    );
    await assertUnavailable(response);
    assert.equal(route.downstreamCalls(), 0);
  });
}

test('erasure returns stable ApiError without starting service-role RPC work', async () => {
  const { createErasureRequest } = await import('@/lib/data/erasure');
  let downstreamCalls = 0;
  await assert.rejects(
    createErasureRequest(
      {
        subjectKind: 'customer',
        subjectUserId: 'user-1',
        subjectTenantId: 'tenant-1',
        tenantSlug: 'tenant',
        subjectName: 'Test User',
        subjectEmail: 'test@example.com',
        recoveryEmail: 'recovery@example.com',
        reason: null,
        ip: '127.0.0.1',
      },
      {
        rateLimitDecision: unavailable,
        createClient: () => {
          downstreamCalls += 1;
          throw new Error('service role client must not run');
        },
      },
    ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'RATE_LIMIT_UNAVAILABLE');
      assert.equal(
        (error as { message?: string }).message,
        'Request protection is temporarily unavailable',
      );
      assert.equal((error as { status?: number }).status, 503);
      return true;
    },
  );
  assert.equal(downstreamCalls, 0);
});
