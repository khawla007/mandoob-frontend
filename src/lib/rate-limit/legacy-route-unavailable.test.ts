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

type RouteDecision = 'allowed' | 'limited' | 'unavailable';

function loadUnavailableRoute(file: string, decisions: RouteDecision[] = ['unavailable']) {
  let downstreamCalls = 0;
  let decisionCalls = 0;
  let sessionLookups = 0;
  const downstream = () => {
    downstreamCalls += 1;
    throw new Error('downstream work must not run');
  };
  const auth = new Proxy(
    {
      getUser: async () => {
        sessionLookups += 1;
        return { data: { user: { id: 'user-1' } } };
      },
    },
    { get: (target, property) => Reflect.get(target, property) ?? downstream },
  );
  const sessionClient = { auth };
  const fallbackModule = new Proxy<Record<string, unknown>>({}, { get: () => downstream });
  const requireModule = (specifier: string) => {
    if (specifier === 'zod') return { z };
    if (specifier === '@supabase/ssr') return { createServerClient: () => sessionClient };
    if (specifier === '@/lib/auth/csrf-guard') return { guardCsrf: async () => null };
    if (specifier === '@/lib/auth/request') {
      return {
        getClientIp: () => '127.0.0.1',
        getUserAgent: () => 'test-agent',
        parseJson: downstream,
      };
    }
    if (specifier === '@/lib/supabase/server') {
      return { createSupabaseServerClient: async () => sessionClient };
    }
    if (specifier === '@/lib/rate-limit') {
      return {
        consumeRateLimitDecision: async () => {
          const decision = decisions[decisionCalls];
          decisionCalls += 1;
          if (!decision) throw new Error('route consumed more limiter decisions than expected');
          return decision;
        },
        rateLimitCorrelationId: () => '00000000-0000-4000-8000-000000000001',
        RATE_LIMITS: {
          authLoginIp: { capacity: 10, refillPerSec: 10 / 60 },
          authPublicIp: { capacity: 20, refillPerSec: 20 / 60 },
          authedPerUser: { capacity: 100, refillPerSec: 100 / 60 },
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
    decisionCalls: () => decisionCalls,
    sessionLookups: () => sessionLookups,
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
    assert.equal(route.sessionLookups(), 0);
    assert.equal(route.decisionCalls(), 1);
  });

  test(`MFA ${name} user-gate unavailability stops all post-session work`, async () => {
    const route = loadUnavailableRoute(file, ['allowed', 'unavailable']);
    const response = await route.POST(
      new Request(`https://localhost:3001/api/v1/auth/mfa/${name}`, { method: 'POST' }),
    );
    await assertUnavailable(response);
    assert.equal(route.sessionLookups(), 1);
    assert.equal(route.decisionCalls(), 2);
    assert.equal(route.downstreamCalls(), 0);
  });
}

const erasureArgs = {
  subjectKind: 'customer' as const,
  subjectUserId: 'user-1',
  subjectTenantId: 'tenant-1',
  tenantSlug: 'tenant',
  subjectName: 'Test User',
  subjectEmail: 'test@example.com',
  recoveryEmail: 'recovery@example.com',
  reason: null,
  ip: '127.0.0.1',
};

for (const [name, decision, code, message, status] of [
  [
    'unavailable',
    'unavailable',
    'RATE_LIMIT_UNAVAILABLE',
    'Request protection is temporarily unavailable',
    503,
  ],
  [
    'user limited',
    { first: 'limited', second: 'allowed' },
    'RATE_LIMITED',
    'An erasure request is already being processed',
    429,
  ],
  [
    'IP limited',
    { first: 'allowed', second: 'limited' },
    'RATE_LIMITED',
    'Too many erasure attempts',
    429,
  ],
] as const) {
  test(`erasure ${name} pair decision starts no service-role work`, async () => {
    const { createErasureRequest } = await import('@/lib/data/erasure');
    let pairCalls = 0;
    let downstreamCalls = 0;
    await assert.rejects(
      createErasureRequest(erasureArgs, {
        rateLimitPairDecision: async () => {
          pairCalls += 1;
          return decision;
        },
        createClient: () => {
          downstreamCalls += 1;
          throw new Error('service role client must not run');
        },
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, code);
        assert.equal((error as { message?: string }).message, message);
        assert.equal((error as { status?: number }).status, status);
        return true;
      },
    );
    assert.equal(pairCalls, 1);
    assert.equal(downstreamCalls, 0);
  });
}
