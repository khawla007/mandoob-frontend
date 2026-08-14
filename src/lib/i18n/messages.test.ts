import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

type Messages = Record<string, unknown>;

const DOCUMENT_TYPES = [
  'passport',
  'visa',
  'emirates_id',
  'trade_license',
  'ejari',
  'moa',
  'shareholder_id',
  'other',
  'aoa',
  'bank_reference_letter',
  'noc',
  'cv_resume',
  'office_lease',
  'medical_certificate',
  'insurance_policy',
] as const;

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value as Messages).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function valueAt(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return (value as Messages)[key];
  }, root);
}

function icuVariables(value: string): string[] {
  const variables = new Set<string>();

  function visit(elements: MessageFormatElement[]) {
    for (const element of elements) {
      if (
        element.type === TYPE.argument ||
        element.type === TYPE.number ||
        element.type === TYPE.date ||
        element.type === TYPE.time ||
        element.type === TYPE.select ||
        element.type === TYPE.plural
      ) {
        variables.add(element.value);
      }
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        for (const option of Object.values(element.options)) visit(option.value);
      } else if (element.type === TYPE.tag) {
        visit(element.children);
      }
    }
  }

  visit(parse(value));
  return [...variables].sort();
}

function documentCenterLiteralKeys(): string[] {
  const route = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/documents/page.tsx'),
    'utf8',
  );
  return [...route.matchAll(/\bt(?:\.raw)?\('([^']+)'/gu)].map((match) => match[1]).sort();
}

function shellKeysFromNavSources() {
  const keys = new Set<string>();
  for (const file of ['nav-admin.ts', 'nav-pro.ts', 'nav-employee.ts']) {
    const source = readFileSync(join(process.cwd(), 'src/lib/shell', file), 'utf8');
    for (const match of source.matchAll(/labelKey:\s*'([^']+)'/g)) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

describe('i18n/messages', () => {
  it('defines shell messages for every dashboard nav label', () => {
    const keys = shellKeysFromNavSources();

    for (const key of keys) {
      assert.ok(key in en.shell, `Missing en.shell.${key}`);
      assert.ok(key in ar.shell, `Missing ar.shell.${key}`);
    }
  });

  it('keeps the complete PRO Document Center namespace in exact recursive parity', () => {
    const english = (en as Messages).proDocumentCenter;
    const arabic = (ar as Messages).proDocumentCenter;
    assert.ok(english, 'Missing en.proDocumentCenter');
    assert.ok(arabic, 'Missing ar.proDocumentCenter');

    const englishPaths = leafPaths(english).sort();
    const arabicPaths = leafPaths(arabic).sort();
    assert.deepEqual(arabicPaths, englishPaths);

    for (const path of englishPaths) {
      const englishValue = valueAt(english, path);
      const arabicValue = valueAt(arabic, path);
      assert.equal(
        typeof englishValue,
        'string',
        `Expected string at en.proDocumentCenter.${path}`,
      );
      assert.equal(typeof arabicValue, 'string', `Expected string at ar.proDocumentCenter.${path}`);
      assert.doesNotThrow(
        () => parse(englishValue as string),
        `Invalid ICU at en.proDocumentCenter.${path}`,
      );
      assert.doesNotThrow(
        () => parse(arabicValue as string),
        `Invalid ICU at ar.proDocumentCenter.${path}`,
      );
      assert.deepEqual(
        icuVariables(arabicValue as string),
        icuVariables(englishValue as string),
        `ICU variables differ at proDocumentCenter.${path}`,
      );

      const arabicWithoutTechnicalTokens = (arabicValue as string)
        .replace(/\{[^}]+\}/gu, '')
        .replace(/\b(?:UAE|MIME|PRO|UTC|KB|MB|GB)\b/gu, '')
        .trim();
      assert.ok(
        /[\u0600-\u06ff]/u.test(arabicWithoutTechnicalTokens) ||
          !/[A-Za-z]{2,}/u.test(arabicWithoutTechnicalTokens),
        `Arabic placeholder or untranslated copy at proDocumentCenter.${path}: ${arabicValue}`,
      );
      assert.notEqual(arabicValue, englishValue, `Copied English at proDocumentCenter.${path}`);
    }
  });

  it('defines every literal and dynamic Document Center translation request', () => {
    const namespaces = [
      ['en', (en as Messages).proDocumentCenter],
      ['ar', (ar as Messages).proDocumentCenter],
    ] as const;
    const dynamicKeys = [
      ...DOCUMENT_TYPES.map((type) => `docTypes.${type}`),
      ...['pending', 'fulfilled', 'cancelled'].map((status) => `requestStatuses.${status}`),
      ...['pending', 'approved', 'rejected'].map((status) => `reviewStatuses.${status}`),
      ...['all', 'requested', 'submitted', 'approved', 'rejected', 'expiring', 'overdue'].map(
        (view) => `views.${view}`,
      ),
      ...['all', 'overdue', '7', '30', '90'].map((window) => `windows.${window}`),
      ...['urgency', 'newest', 'oldest', 'due_date', 'expiry_date'].map((sort) => `sorts.${sort}`),
      ...[
        'awaitingUpload',
        'awaitingReview',
        'approved',
        'rejected',
        'expiring',
        'overdue',
      ].flatMap((summary) =>
        ['title', 'helper', 'failed', 'retry', 'aria'].map(
          (field) => `summary.${summary}.${field}`,
        ),
      ),
      'loading.label',
      'pageError.title',
      'pageError.description',
      'pageError.retry',
      'queue.partialError',
      'history.error',
      'clientSearch.select',
      'clientSearch.loading',
    ];

    for (const [locale, namespace] of namespaces) {
      for (const key of [...documentCenterLiteralKeys(), ...dynamicKeys]) {
        assert.equal(
          typeof valueAt(namespace, key),
          'string',
          `Missing ${locale}.proDocumentCenter.${key}`,
        );
      }
    }
  });

  it('provides exactly the 15 supported document type labels', () => {
    for (const messages of [en, ar]) {
      assert.deepEqual(
        Object.keys((messages as Messages).proDocumentCenter as Messages).includes('docTypes'),
        true,
      );
      assert.deepEqual(
        Object.keys(
          ((messages as Messages).proDocumentCenter as Messages).docTypes as Messages,
        ).sort(),
        [...DOCUMENT_TYPES].sort(),
      );
    }
  });

  it('maps every stable Document Center action message key and code to localized recovery copy', () => {
    const actionLogic = readFileSync(
      join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/documents/action-logic.ts'),
      'utf8',
    );
    const expectedErrorKeys = [
      'validation',
      'unauthorized',
      'forbidden',
      'notFound',
      'tenantInactive',
      'expiryExternallyManaged',
      'openFailed',
      'unexpected',
    ];
    const stableCodes = [
      'VALIDATION_FAILED',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'TENANT_NOT_FOUND',
      'TENANT_INACTIVE',
      'EXPIRY_EXTERNALLY_MANAGED',
      'STORAGE_SIGN_FAILED',
      'INTERNAL',
      'SUCCESS',
    ];
    for (const code of stableCodes) {
      assert.match(actionLogic, new RegExp(`(?:${code}:|'${code}')`, 'u'));
    }
    for (const messages of [en, ar]) {
      const errors = ((messages as Messages).proDocumentCenter as Messages).errors;
      for (const key of expectedErrorKeys) {
        assert.equal(
          typeof valueAt(errors, key),
          'string',
          `Missing localized action error ${key}`,
        );
      }
    }
  });

  it('uses the exact ICU variables consumed by queue pagination and summary links', () => {
    for (const messages of [en, ar]) {
      const namespace = (messages as Messages).proDocumentCenter;
      assert.deepEqual(icuVariables(valueAt(namespace, 'queue.result') as string), [
        'from',
        'to',
        'total',
      ]);
      assert.deepEqual(icuVariables(valueAt(namespace, 'queue.pageCount') as string), [
        'current',
        'total',
      ]);
      for (const summary of [
        'awaitingUpload',
        'awaitingReview',
        'approved',
        'rejected',
        'expiring',
        'overdue',
      ]) {
        assert.deepEqual(icuVariables(valueAt(namespace, `summary.${summary}.aria`) as string), [
          'count',
          'helper',
        ]);
      }
    }
  });
});
