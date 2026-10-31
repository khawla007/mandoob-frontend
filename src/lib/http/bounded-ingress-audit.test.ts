import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.STRIPE_DESTINATION = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_bounded_ingress';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_bounded_ingress';
process.env.SUPABASE_AUTH_WEBHOOK_SECRET = 'supabase-hook-secret';
process.env.TWILIO_AUTH_TOKEN = 'twilio-auth-token';
process.env.UNIFONIC_WEBHOOK_SECRET = 'unifonic-hook-secret';
process.env.WHATSAPP_APP_SECRET = 'whatsapp-app-secret';

const root = process.cwd();
const apiRoot = join(root, 'src/app/api/v1');
const scopes = ['auth', 'public', 'webhooks'] as const;
const bodyMethods = new Set(['arrayBuffer', 'formData', 'json', 'text']);

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return /\.(?:ts|tsx)$/u.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/u.test(entry.name)
      ? [path]
      : [];
  });
}

function sourceFile(path: string) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
}

function originalRequestBodyCalls(path: string): string[] {
  const found: string[] = [];
  const source = sourceFile(path);
  const requestIdentifiers = new Set<string>();
  const collectRequests = (node: ts.Node): void => {
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.type) {
      const type = node.type.getText(source);
      if (/(?:^|\W)(?:Next)?Request(?:$|\W)/u.test(type)) requestIdentifiers.add(node.name.text);
    }
    ts.forEachChild(node, collectRequests);
  };
  collectRequests(source);

  let addedAlias = true;
  while (addedAlias) {
    addedAlias = false;
    const collectAliases = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isIdentifier(node.initializer) &&
        requestIdentifiers.has(node.initializer.text) &&
        !requestIdentifiers.has(node.name.text)
      ) {
        requestIdentifiers.add(node.name.text);
        addedAlias = true;
      }
      ts.forEachChild(node, collectAliases);
    };
    collectAliases(source);
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      requestIdentifiers.has(node.expression.expression.text) &&
      bodyMethods.has(node.expression.name.text)
    ) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      found.push(`${relative(root, path)}:${line} ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const expectedIngress: Record<string, readonly string[]> = {
  'src/app/api/v1/public/contact/handler.ts': ['readBoundedJson'],
  'src/app/api/v1/public/applications/drafts/handler.ts': ['readBoundedJson'],
  'src/app/api/v1/public/applications/drafts/[id]/handler.ts': ['readBoundedJson'],
  'src/app/api/v1/public/applications/drafts/[id]/submit/handler.ts': ['readBoundedJson'],
  'src/app/api/v1/public/applications/drafts/[id]/attachments/handler.ts': [
    'readBoundedBody',
    'createBoundedRequest',
    'readBoundedJson',
  ],
  'src/app/api/v1/webhooks/tap/route.ts': ['readBoundedBody'],
  'src/app/api/v1/webhooks/stripe/route.ts': ['readBoundedBody', 'decodeBoundedUtf8'],
  'src/app/api/v1/webhooks/supabase-auth/route.ts': ['readBoundedBody', 'decodeBoundedUtf8'],
  'src/app/api/v1/webhooks/twilio/route.ts': ['readBoundedBody', 'decodeBoundedUtf8'],
  'src/app/api/v1/webhooks/unifonic/route.ts': ['readBoundedBody', 'decodeBoundedUtf8'],
  'src/app/api/v1/webhooks/whatsapp/route.ts': ['readBoundedBody', 'decodeBoundedUtf8'],
};

test('all auth, public, and webhook request bodies enter through canonical bounded ingress', () => {
  const files = scopes.flatMap((scope) => productionFiles(join(apiRoot, scope)));
  const directCalls = files.flatMap(originalRequestBodyCalls);
  assert.deepEqual(directCalls, [], `unbounded original Request reads:\n${directCalls.join('\n')}`);

  for (const [path, helpers] of Object.entries(expectedIngress)) {
    const source = readFileSync(join(root, path), 'utf8');
    assert.match(
      source,
      /from ['"]@\/lib\/http\/bounded-body['"]/u,
      `${path} must import the canonical bounded-body module`,
    );
    for (const helper of helpers) {
      assert.match(source, new RegExp(`\\b${helper}\\b`, 'u'), `${path} must use ${helper}`);
    }
  }
});

test('the shared auth JSON parser is itself bounded by the canonical public JSON limit', () => {
  const path = join(root, 'src/lib/auth/request.ts');
  const source = readFileSync(path, 'utf8');
  assert.match(source, /from ['"]@\/lib\/http\/bounded-body['"]/u);
  assert.match(source, /readBoundedJson\(request, BODY_LIMITS\.publicJson\)/u);
  assert.deepEqual(originalRequestBodyCalls(path), []);
});

test('bounded ingress precedes parsing, signature verification, and privileged work', () => {
  const firstSensitiveMarker: Record<string, string> = {
    'src/app/api/v1/public/contact/handler.ts': 'requestSchema.safeParse',
    'src/app/api/v1/public/applications/drafts/handler.ts': 'requestSchema.safeParse',
    'src/app/api/v1/public/applications/drafts/[id]/handler.ts': 'saveSchema.safeParse',
    'src/app/api/v1/public/applications/drafts/[id]/submit/handler.ts': 'submitSchema.safeParse',
    'src/app/api/v1/public/applications/drafts/[id]/attachments/handler.ts': "form.get('file')",
    'src/app/api/v1/webhooks/tap/route.ts': 'createSupabaseServiceRoleClient()',
    'src/app/api/v1/webhooks/stripe/route.ts': 'verifyWebhookSignature(rawBody',
    'src/app/api/v1/webhooks/supabase-auth/route.ts': 'verifySignature(raw, sig)',
    'src/app/api/v1/webhooks/twilio/route.ts': 'parseFormBody(rawBody)',
    'src/app/api/v1/webhooks/unifonic/route.ts': 'verifyUnifonicSignature(rawBody',
    'src/app/api/v1/webhooks/whatsapp/route.ts': 'verifyHubSignature(rawBody',
  };

  for (const [path, marker] of Object.entries(firstSensitiveMarker)) {
    const source = readFileSync(join(root, path), 'utf8');
    const bounded = source.indexOf('await readBounded');
    const sensitive = source.indexOf(marker);
    assert.ok(bounded >= 0, `${path} has no awaited bounded read`);
    assert.ok(sensitive > bounded, `${path} performs ${marker} before bounded ingress`);
  }
});

type OverflowHeaders = 'chunked' | 'missing' | 'understated';

function overflowingRequest(
  url: string,
  maxBytes: number,
  headers: Record<string, string> = {},
  mode: OverflowHeaders = 'missing',
  method = 'POST',
): Request {
  const bytes = new Uint8Array(maxBytes + 1);
  bytes.fill(0x20);
  const requestHeaders = new Headers(headers);
  if (mode === 'chunked') requestHeaders.set('transfer-encoding', 'chunked');
  if (mode === 'understated') requestHeaders.set('content-length', '1');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, Math.floor(bytes.byteLength / 2)));
      controller.enqueue(bytes.subarray(Math.floor(bytes.byteLength / 2)));
      controller.close();
    },
  });
  return new Request(url, {
    method,
    headers: requestHeaders,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

test('public JSON ingress rejects chunked, missing-length, and understated overflows before downstream work', async () => {
  const [{ handlePublicContactPost }, { handleCreateDraftPost }] = await Promise.all([
    import('@/app/api/v1/public/contact/handler'),
    import('@/app/api/v1/public/applications/drafts/handler'),
  ]);
  let downstream = 0;
  for (const mode of ['chunked', 'missing', 'understated'] as const) {
    const contact = await handlePublicContactPost(
      overflowingRequest(
        'https://mandoob.test/api/v1/public/contact',
        16_384,
        { origin: 'https://mandoob.test', 'content-type': 'application/json' },
        mode,
      ),
      {
        appUrl: 'https://mandoob.test',
        rateLimit: async () => {
          downstream += 1;
          return 'allowed';
        },
        accept: async () => {
          downstream += 1;
          throw new Error('must not accept');
        },
      },
    );
    const application = await handleCreateDraftPost(
      overflowingRequest(
        'https://mandoob.test/api/v1/public/applications/drafts',
        4_096,
        { origin: 'https://mandoob.test', 'content-type': 'application/json' },
        mode,
      ),
      {
        appUrl: 'https://mandoob.test',
        rateLimit: async () => {
          downstream += 1;
          return 'allowed';
        },
        create: async () => {
          downstream += 1;
          throw new Error('must not create');
        },
      },
    );
    assert.equal(contact.status, 413, `contact accepted ${mode} overflow`);
    assert.equal(application.status, 413, `application accepted ${mode} overflow`);
  }
  assert.equal(downstream, 0);
});

test('multipart ingress rejects every length-header overflow mode before FormData parsing or upload', async () => {
  const { handleUploadAttachmentPost } =
    await import('@/app/api/v1/public/applications/drafts/[id]/attachments/handler');
  let downstream = 0;
  for (const mode of ['chunked', 'missing', 'understated'] as const) {
    const response = await handleUploadAttachmentPost(
      overflowingRequest(
        'https://mandoob.test/api/v1/public/applications/drafts/draft/attachments',
        12 * 1024 * 1024,
        {
          origin: 'https://mandoob.test',
          'content-type': 'multipart/form-data; boundary=bounded-ingress-test',
          'x-resume-token': 'opaque-resume-secret-value-abcdef',
        },
        mode,
      ),
      'draft',
      {
        appUrl: 'https://mandoob.test',
        rateLimit: async () => {
          downstream += 1;
          return 'allowed';
        },
        upload: async () => {
          downstream += 1;
          throw new Error('must not upload');
        },
      },
    );
    assert.equal(response.status, 413, `multipart accepted ${mode} overflow`);
  }
  assert.equal(downstream, 0);
});

test('all provider webhook entry points reject actual streamed overflow with 413', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('downstream fetch must not run');
  };
  try {
    const [tap, stripe, supabaseAuth, twilio, unifonic, whatsapp] = await Promise.all([
      import('@/app/api/v1/webhooks/tap/route'),
      import('@/app/api/v1/webhooks/stripe/route'),
      import('@/app/api/v1/webhooks/supabase-auth/route'),
      import('@/app/api/v1/webhooks/twilio/route'),
      import('@/app/api/v1/webhooks/unifonic/route'),
      import('@/app/api/v1/webhooks/whatsapp/route'),
    ]);
    const routes = [
      tap.POST,
      stripe.POST,
      supabaseAuth.POST,
      twilio.POST,
      unifonic.POST,
      whatsapp.POST,
    ];
    for (const [index, route] of routes.entries()) {
      for (const mode of ['chunked', 'missing', 'understated'] as const) {
        const response = await route(
          overflowingRequest(
            `https://mandoob.test/api/v1/webhooks/provider-${index}`,
            256 * 1024,
            { 'content-type': 'application/json' },
            mode,
          ) as never,
        );
        assert.equal(
          response.status,
          413,
          `webhook route ${index} did not reject ${mode} overflow`,
        );
        const body = await response.json();
        assert.equal(body.code, 'PAYLOAD_TOO_LARGE');
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('signed text webhook entry points reject invalid UTF-8 before verification or downstream work', async () => {
  const [stripe, supabaseAuth, twilio, unifonic, whatsapp] = await Promise.all([
    import('@/app/api/v1/webhooks/stripe/route'),
    import('@/app/api/v1/webhooks/supabase-auth/route'),
    import('@/app/api/v1/webhooks/twilio/route'),
    import('@/app/api/v1/webhooks/unifonic/route'),
    import('@/app/api/v1/webhooks/whatsapp/route'),
  ]);
  for (const route of [stripe.POST, supabaseAuth.POST, twilio.POST, unifonic.POST, whatsapp.POST]) {
    const response = await route(
      new Request('https://mandoob.test/api/v1/webhooks/provider', {
        method: 'POST',
        body: new Uint8Array([0xc3, 0x28]),
      }) as never,
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'BAD_REQUEST');
  }
});

test('exact-limit signed payloads retain every byte through bounded ingress', async () => {
  const { createHmac } = await import('node:crypto');
  const [
    { BODY_LIMITS, decodeBoundedUtf8, readBoundedBody },
    { verifyUnifonicSignature },
    { verifyHubSignature },
  ] = await Promise.all([
    import('./bounded-body'),
    import('@/lib/sms/signature'),
    import('@/lib/whatsapp/signature'),
  ]);
  const raw = `${' '.repeat(BODY_LIMITS.providerWebhook - 2)}{}`;
  const unifonicSignature = createHmac('sha256', 'unifonic-hook-secret').update(raw).digest('hex');
  const whatsappSignature = `sha256=${createHmac('sha256', 'whatsapp-app-secret')
    .update(raw)
    .digest('hex')}`;
  const request = new Request('https://mandoob.test/webhook', { method: 'POST', body: raw });
  const bounded = decodeBoundedUtf8(await readBoundedBody(request, BODY_LIMITS.providerWebhook));
  assert.equal(bounded, raw);
  assert.equal(verifyUnifonicSignature(bounded, unifonicSignature, 'unifonic-hook-secret'), true);
  assert.equal(verifyHubSignature(bounded, whatsappSignature, 'whatsapp-app-secret'), true);
});
