import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

import type { ContactSubmissionResult, NormalizedContactPayload } from './contracts';
import {
  createSyntheticContactAdapter,
  productionContactAdapter,
  SYNTHETIC_CONTACT_NOTICE,
} from './demo-adapter';

const payload: NormalizedContactPayload = {
  fullName: 'Amina Noor',
  email: 'amina@example.com',
  phone: '+971501234567',
  subject: 'company_setup',
  message: 'Please help me set up my company.',
  consent: true,
};

function moduleSpecifiersIn(source: string): string[] {
  const ast = ts.createSourceFile(
    'dependency-audit.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  const addSpecifier = (node: ts.Expression | undefined) => {
    specifiers.push(
      node && ts.isStringLiteralLike(node)
        ? node.text
        : `<non-literal:${node?.getText(ast) ?? 'missing'}>`,
    );
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addSpecifier(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addSpecifier(node.argument.literal);
    } else if (ts.isCallExpression(node)) {
      if (
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments.length >= 1
      ) {
        addSpecifier(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(ast);
  return specifiers;
}

function dangerousCodeConstructsIn(source: string): string[] {
  const ast = ts.createSourceFile(
    'execution-audit.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const constructs: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === 'eval' || node.expression.text === 'Function')
    ) {
      constructs.push(node.expression.text);
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Function'
    ) {
      constructs.push('new Function');
    }
    ts.forEachChild(node, visit);
  };

  visit(ast);
  return constructs;
}

test('production adapter honestly reports unavailable without claiming a send', async () => {
  const result = await productionContactAdapter.submit(payload);
  assert.deepEqual(result, {
    status: 'unavailable',
    sent: false,
    message: 'Contact delivery is not available yet. No message was sent.',
  });
});

test('synthetic adapters expose every result discriminant with safe user-facing data', async () => {
  const statuses = ['success', 'duplicate', 'rate_limited', 'failure', 'unavailable'] as const;
  const results: ContactSubmissionResult[] = [];

  for (const status of statuses) {
    results.push(await createSyntheticContactAdapter(status).submit(payload));
  }

  assert.deepEqual(
    results.map((result) => result.status),
    statuses,
  );
  for (const result of results) {
    assert.equal(result.sent, false);
    assert.match(result.message, /no message was sent/i);
    assert.equal(result.synthetic, true);
    assert.equal(result.notice, SYNTHETIC_CONTACT_NOTICE);
  }
  const rateLimited = results[2];
  assert.equal(rateLimited.status, 'rate_limited');
  if (rateLimited.status === 'rate_limited') assert.equal(rateLimited.retryAfterSeconds, 60);
  const failure = results[3];
  assert.equal(failure.status, 'failure');
  if (failure.status === 'failure') assert.equal(failure.retryable, true);
});

test('synthetic and production adapters are deterministic and do not mutate submissions', async () => {
  const original = structuredClone(payload);

  for (const status of [
    'success',
    'duplicate',
    'rate_limited',
    'failure',
    'unavailable',
  ] as const) {
    const adapter = createSyntheticContactAdapter(status);
    assert.deepEqual(await adapter.submit(payload), await adapter.submit(payload));
  }
  assert.deepEqual(
    await productionContactAdapter.submit(payload),
    await productionContactAdapter.submit(payload),
  );
  assert.deepEqual(payload, original);
});

test('contact result types permit only coherent real and synthetic delivery states', () => {
  const validResults = [
    { status: 'success', sent: true, message: 'Message sent.' },
    {
      status: 'success',
      sent: false,
      synthetic: true,
      notice: SYNTHETIC_CONTACT_NOTICE,
      message: 'Synthetic success. No message was sent.',
    },
    { status: 'duplicate', sent: false, message: 'No duplicate message was sent.' },
    {
      status: 'rate_limited',
      sent: false,
      synthetic: true,
      notice: SYNTHETIC_CONTACT_NOTICE,
      retryAfterSeconds: 60,
      message: 'Synthetic rate limit. No message was sent.',
    },
  ] satisfies ContactSubmissionResult[];

  // @ts-expect-error An unsent success must be explicitly synthetic.
  const impossibleUnsentSuccess: ContactSubmissionResult = {
    status: 'success',
    sent: false,
    message: 'Contradictory success.',
  };
  // @ts-expect-error A real sent success cannot be synthetic.
  const impossibleSyntheticSend: ContactSubmissionResult = {
    status: 'success',
    sent: true,
    synthetic: true,
    notice: SYNTHETIC_CONTACT_NOTICE,
    message: 'Contradictory synthetic send.',
  };
  // @ts-expect-error Duplicate outcomes never represent a sent message.
  const impossibleSentDuplicate: ContactSubmissionResult = {
    status: 'duplicate',
    sent: true,
    message: 'Contradictory duplicate.',
  };
  // @ts-expect-error Synthetic outcomes require their no-send notice.
  const impossibleSyntheticWithoutNotice: ContactSubmissionResult = {
    status: 'unavailable',
    sent: false,
    synthetic: true,
    message: 'Missing synthetic notice.',
  };
  // @ts-expect-error Non-synthetic outcomes cannot carry a synthetic notice.
  const impossibleNoticeWithoutSynthetic: ContactSubmissionResult = {
    status: 'failure',
    sent: false,
    retryable: true,
    notice: SYNTHETIC_CONTACT_NOTICE,
    message: 'Orphaned synthetic notice.',
  };

  assert.equal(validResults.length, 4);
  assert.equal(
    [
      impossibleUnsentSuccess,
      impossibleSyntheticSend,
      impossibleSentDuplicate,
      impossibleSyntheticWithoutNotice,
      impossibleNoticeWithoutSynthetic,
    ].length,
    5,
  );
});

test('dependency audit enumerates every TypeScript module dependency form', () => {
  const fixture = `
    import value from './static';
    import './side-effect';
    import legacy = require('./import-equals');
    export { value as renamed } from './re-export';
    export * from './star-re-export';
    const required = require('./require-call');
    const dynamic = import('./dynamic-import', { with: { type: 'json' } });
    type Imported = import('./import-type').Imported;
    const moduleName = './computed';
    const computedRequired = require(moduleName);
    const computedDynamic = import(moduleName);
  `;

  assert.deepEqual(moduleSpecifiersIn(fixture), [
    './static',
    './side-effect',
    './import-equals',
    './re-export',
    './star-re-export',
    './require-call',
    './dynamic-import',
    './import-type',
    '<non-literal:moduleName>',
    '<non-literal:moduleName>',
  ]);
  assert.deepEqual(
    dangerousCodeConstructsIn(`eval('code'); Function('code'); new Function('code');`),
    ['eval', 'Function', 'new Function'],
  );
});

test('adapter source has no I/O, server action, provider, timer, random, or notification path', () => {
  const source = readFileSync(new URL('./demo-adapter.ts', import.meta.url), 'utf8');
  assert.deepEqual(
    moduleSpecifiersIn(source),
    ['./contracts'],
    'adapter may only depend on its pure type contract',
  );
  assert.deepEqual(dangerousCodeConstructsIn(source), []);

  const forbidden: Array<[string, RegExp]> = [
    ['fetch', /\bfetch\s*\(/u],
    ['Supabase', /supabase/iu],
    ['server action directive', /['"]use server['"]/u],
    [
      'email/SMS/WhatsApp/provider import',
      /from\s+['"][^'"]*(?:email|sms|whatsapp|nodemailer|resend|twilio|provider)[^'"]*['"]/iu,
    ],
    ['timer', /\b(?:setTimeout|setInterval|queueMicrotask)\s*\(/u],
    ['randomness', /\b(?:Math\.random|crypto\.(?:randomUUID|getRandomValues))\s*\(/u],
    [
      'network call',
      /\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon|network|http|https)\b/iu,
    ],
    ['database call', /\b(?:database|db|client)\.\w+\s*\(/iu],
    ['notification call', /\b(?:notify|sendNotification|notification\.\w+)\s*\(/iu],
    ['filesystem write', /\b(?:writeFile|appendFile|createWriteStream)\s*\(/u],
  ];

  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(source, pattern, label);
  }
});
