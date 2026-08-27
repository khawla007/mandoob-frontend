import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { createTranslator } from 'use-intl/core';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import {
  COMPANY_ONBOARDING_READINESS_CODES,
  COMPANY_ONBOARDING_SECTION_KEYS,
} from '@/lib/company-onboarding/contracts';
import { PRO_CREDENTIAL_STATES } from '@/lib/pro-lifecycle/contracts';

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

function icuLiteralText(value: string): string {
  const literals: string[] = [];
  function visit(elements: MessageFormatElement[]) {
    for (const element of elements) {
      if (element.type === TYPE.literal) literals.push(element.value);
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        for (const option of Object.values(element.options)) visit(option.value);
      } else if (element.type === TYPE.tag) {
        visit(element.children);
      }
    }
  }
  visit(parse(value));
  return literals.join(' ');
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
  it('keeps the registry account-status options unique in raw JSON and resolves every dynamic status at runtime', () => {
    const dynamicStatusKeys = [
      ...['active', 'invited', 'inactive'].map((value) => `accountStatus.${value}`),
      ...PRO_CREDENTIAL_STATES.map((value) => `credentialState.${value}`),
      ...['eligible', 'ineligible'].map((value) => `eligibility.${value}`),
      ...['assigned', 'unassigned'].map((value) => `assignment.${value}`),
      ...['expired', '30_days', '60_days', '90_days'].map((value) => `expiryWindow.${value}`),
      ...['active', 'invited', 'inactive', 'disabled', 'suspended'].map(
        (value) => `account.${value}`,
      ),
      ...PRO_CREDENTIAL_STATES.map((value) => `credential.${value}`),
      ...['eligible', 'ineligible'].map((value) => `eligible.${value}`),
    ];

    for (const [locale, messages] of [
      ['en', en],
      ['ar', ar],
    ] as const) {
      const raw = readFileSync(join(process.cwd(), `src/messages/${locale}.json`), 'utf8');
      assert.equal(
        (raw.match(/^ {8}"accountStatus":/gmu) ?? []).length,
        1,
        `${locale} has duplicate admin.user.proRegistry.accountStatus keys`,
      );
      const translate = createTranslator({
        locale,
        messages,
        namespace: 'admin.user.proRegistry',
      });
      const translateStatus = translate as (key: string) => string;
      const namespace = valueAt(messages, 'admin.user.proRegistry');
      for (const key of dynamicStatusKeys) {
        const expected = valueAt(namespace, key);
        assert.equal(typeof expected, 'string', `Missing ${locale} dynamic status ${key}`);
        assert.equal(
          translateStatus(key),
          expected,
          `Runtime translation failed for ${locale}.${key}`,
        );
      }
    }
  });

  it('catalogs every PRO lifecycle state, event, error, term, filter, and action in exact EN/AR parity', () => {
    const lifecyclePaths = [
      ...PRO_CREDENTIAL_STATES.flatMap((state) => [
        `admin.user.proRegistry.credentialState.${state}`,
        `admin.user.proRegistry.credential.${state}`,
        `admin.user.proLifecycle.credentialStates.${state}`,
        `account.proCredential.states.${state}`,
      ]),
      ...[
        'credential_submitted',
        'credential_review_started',
        'credential_verified',
        'credential_rejected',
        'credential_expired',
        'credential_revoked',
        'credential_superseded',
        'assignment_assigned',
        'assignment_released',
      ].map((event) => `admin.user.proLifecycle.timeline.events.${event}`),
      ...['draft', 'active', 'ended'].map(
        (status) => `admin.user.proLifecycle.terms.statuses.${status}`,
      ),
      ...['create', 'activate', 'end'].map(
        (action) => `admin.user.proLifecycle.terms.form.actions.${action}`,
      ),
      ...['begin_review', 'verify', 'reject', 'revoke'].map(
        (action) => `admin.user.proLifecycle.review.commands.${action}`,
      ),
      ...['accountStatus', 'credentialState', 'eligibility', 'assignment', 'expiryWindow'].map(
        (filter) => `admin.user.proRegistry.filters.${filter}`,
      ),
      ...[
        'admin.user.proRegistry.errorDescription',
        'admin.user.proRegistry.partialEmail',
        'admin.user.proLifecycle.credential.loadError',
        'admin.user.proLifecycle.credential.retryFormLabel',
        'admin.user.proLifecycle.terms.loadError',
        'admin.user.proLifecycle.terms.retryFormLabel',
        'admin.user.proLifecycle.timeline.loadError',
        'admin.user.proLifecycle.timeline.retryFormLabel',
        'admin.user.proLifecycle.review.failed',
        'admin.user.proLifecycle.review.stale',
        'admin.user.proLifecycle.review.conflict',
        'admin.user.proLifecycle.terms.form.failed',
        'admin.user.proLifecycle.terms.form.stale',
        'admin.user.proLifecycle.terms.form.conflict',
        'account.proCredential.failed',
        'account.proCredential.stale',
        'account.proCredential.replayConflict',
        'account.proCredential.partialSource',
      ],
    ];

    for (const path of lifecyclePaths) {
      const englishValue = valueAt(en, path);
      const arabicValue = valueAt(ar, path);
      assert.equal(typeof englishValue, 'string', `Missing en.${path}`);
      assert.equal(typeof arabicValue, 'string', `Missing ar.${path}`);
      assert.deepEqual(
        icuVariables(arabicValue as string),
        icuVariables(englishValue as string),
        `ICU variables differ at ${path}`,
      );
      const arabicLiteral = icuLiteralText(arabicValue as string)
        .replace(/\b(?:PRO|AED)\b/gu, '')
        .trim();
      assert.ok(/[\u0600-\u06ff]/u.test(arabicLiteral), `Arabic copy is not meaningful at ${path}`);
    }
  });
  it('keeps the complete company onboarding namespace in exact recursive parity', () => {
    const english = (en as Messages).companyOnboarding;
    const arabic = (ar as Messages).companyOnboarding;
    assert.ok(english, 'Missing en.companyOnboarding');
    assert.ok(arabic, 'Missing ar.companyOnboarding');
    const englishPaths = leafPaths(english).sort();
    const arabicPaths = leafPaths(arabic).sort();
    assert.deepEqual(arabicPaths, englishPaths);

    for (const path of englishPaths) {
      const englishValue = valueAt(english, path);
      const arabicValue = valueAt(arabic, path);
      assert.equal(typeof englishValue, 'string', `Expected en.companyOnboarding.${path}`);
      assert.equal(typeof arabicValue, 'string', `Expected ar.companyOnboarding.${path}`);
      assert.deepEqual(
        icuVariables(arabicValue as string),
        icuVariables(englishValue as string),
        `ICU variables differ at companyOnboarding.${path}`,
      );
      const literal = icuLiteralText(arabicValue as string)
        .replace(/\b(?:PRO|UAE|IBAN|SWIFT|BIC|AED)\b/gu, '')
        .trim();
      assert.ok(
        /[\u0600-\u06ff]/u.test(literal) || !/[A-Za-z]{2,}/u.test(literal),
        `Arabic placeholder at companyOnboarding.${path}`,
      );
    }

    for (const section of [...COMPANY_ONBOARDING_SECTION_KEYS, 'review']) {
      assert.equal(typeof valueAt(english, `sections.${section}.step`), 'string');
    }
    for (const code of COMPANY_ONBOARDING_READINESS_CODES) {
      assert.equal(typeof valueAt(english, `requirements.${code}`), 'string');
      assert.equal(typeof valueAt(arabic, `requirements.${code}`), 'string');
    }
  });
  it('defines shell messages for every dashboard nav label', () => {
    const keys = shellKeysFromNavSources();

    for (const key of keys) {
      assert.ok(key in en.shell, `Missing en.shell.${key}`);
      assert.ok(key in ar.shell, `Missing ar.shell.${key}`);
    }
  });

  it('keeps the complete public site namespace in exact recursive and ICU parity', () => {
    const english = (en as Messages).site;
    const arabic = (ar as Messages).site;
    assert.ok(english, 'Missing en.site');
    assert.ok(arabic, 'Missing ar.site');

    const englishPaths = leafPaths(english).sort();
    const arabicPaths = leafPaths(arabic).sort();
    assert.deepEqual(arabicPaths, englishPaths);

    for (const path of englishPaths) {
      const englishValue = valueAt(english, path);
      const arabicValue = valueAt(arabic, path);
      assert.equal(typeof englishValue, 'string', `Expected en.site.${path}`);
      assert.equal(typeof arabicValue, 'string', `Expected ar.site.${path}`);
      assert.deepEqual(
        icuVariables(arabicValue as string),
        icuVariables(englishValue as string),
        `ICU variables differ at site.${path}`,
      );
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

      const arabicWithoutTechnicalTokens = icuLiteralText(arabicValue as string)
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
    const exactPairs = {
      UNAUTHORIZED: 'documents.errors.unauthorized',
      FORBIDDEN: 'documents.errors.forbidden',
      NOT_FOUND: 'documents.errors.notFound',
      TENANT_NOT_FOUND: 'documents.errors.notFound',
      TENANT_INACTIVE: 'documents.errors.tenantInactive',
      EXPIRY_EXTERNALLY_MANAGED: 'documents.errors.expiryExternallyManaged',
      STORAGE_SIGN_FAILED: 'documents.errors.openFailed',
      VALIDATION_FAILED: 'documents.errors.validation',
    } as const;
    for (const [code, key] of Object.entries(exactPairs)) {
      assert.match(actionLogic, new RegExp(`${code}:\\s*'${key.replaceAll('.', '\\.')}'`, 'u'));
    }
    assert.match(
      actionLogic,
      /code:\s*'INTERNAL',\s*messageKey:\s*'documents\.errors\.unexpected'/u,
    );
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

  it('formats visible English and Arabic counts through complete ICU plural branches', () => {
    const english = createTranslator({
      locale: 'en',
      messages: en,
      namespace: 'proDocumentCenter',
    });
    const arabic = createTranslator({
      locale: 'ar',
      messages: ar,
      namespace: 'proDocumentCenter',
    });

    assert.match(english('heading.subtitle', { tenant: 'Acme', count: 1 }), /1 record/u);
    assert.match(english('heading.subtitle', { tenant: 'Acme', count: 2 }), /2 records/u);
    assert.match(english('queue.result', { from: 1, to: 1, total: 1 }), /1 result/u);
    assert.match(english('queue.result', { from: 1, to: 2, total: 2 }), /2 results/u);
    const cases = [
      [0, /لا سجلات/u, /لا توجد نتائج/u],
      [1, /سجل واحد/u, /نتيجة واحدة/u],
      [2, /سجلين/u, /نتيجتين/u],
      [3, /(?:٣|3) سجلات/u, /(?:٣|3) نتائج/u],
      [11, /(?:١١|11) سجلًا/u, /(?:١١|11) نتيجة/u],
    ] as const;
    for (const [count, headingExpected, queueExpected] of cases) {
      assert.match(arabic('heading.subtitle', { tenant: 'أكمي', count }), headingExpected);
      const queueResult = arabic('queue.result', {
        from: 1,
        to: Math.max(1, count),
        total: count,
      });
      assert.match(queueResult, queueExpected);
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
