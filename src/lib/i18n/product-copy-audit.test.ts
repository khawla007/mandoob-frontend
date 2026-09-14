import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

type Messages = Record<string, unknown>;

const OBSOLETE_PRODUCT_CLAIMS = [
  /\badd client\b/iu,
  /\bclient limits?\b/iu,
  /\bclient onboarding\b/iu,
  /\bclient switcher\b/iu,
  /\bevery client\b/iu,
  /\bmany clients\b/iu,
  /\bmultiple clients\b/iu,
  /\bpro firm tenant\b/iu,
  /\bpro firms?\b/iu,
  /\bpro team\b/iu,
  /\bscale limits?\b/iu,
  /\bat scale\b/iu,
  />\s*scale\.\s*</iu,
  /\bswitch tenants\b/iu,
  /\btenant switcher\b/iu,
  /\b50 to 5,000 clients\b/iu,
  /\bactive team member\b/iu,
  /\bfirm admins?\b/iu,
  /\bteam workload\b/iu,
  /\bteam page\b/iu,
  /\bworkspace signals for your team\b/iu,
  /إضافة عميل/iu,
  /تبديل العميل/iu,
  /عدة عملاء/iu,
  /عملاء متعدد/iu,
  /فريق (?:PRO|البرو)/iu,
  /(?:شركات|مكتب) PRO/iu,
  /(?:التوسّع|التوسع)/u,
] as const;

const UNIVERSAL_LEGAL_CLAIMS = [
  /\b(?:required|mandated|limited) by UAE law\b/iu,
  /\buniversal UAE (?:law|limit|maximum)\b/iu,
  /\blegal(?:ly)? (?:limited|restricted) to one (?:PRO|company)\b/iu,
  /(?=[^.\n]*(?:القانون الإماراتي|قانون (?:دولة )?الإمارات(?: العربية المتحدة)?))(?=[^.\n]*(?:يفرض|مطلوب|بموجب|إلزامي|يلزم|يتطلب))(?=[^.\n]*PRO)(?=[^.\n]*شركة)(?=[^.\n]*(?:واحد|واحدة))[^.\n]+/u,
  /حد قانوني إماراتي/u,
] as const;

const VISIBLE_TENANT_SOURCE_PATTERNS = [
  />\s*(?:all\s+)?tenants?\s*</iu,
  /\b(?:aria-label|label|placeholder|title)=["'][^"']*\btenants?\b/iu,
  /\blabelFallback:\s*["'](?:all\s+)?tenants?["']/iu,
  /["'`]\s*[^"'`\n]*\bthe tenants?\b[^"'`\n]*\s*["'`]/iu,
] as const;

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function auditableSourceFiles(directory = 'src'): string[] {
  return readdirSync(join(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return auditableSourceFiles(path);
    if (!/\.(?:json|ts|tsx)$/u.test(entry.name) || /\.test\.(?:ts|tsx)$/u.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

function auditableDocumentationFiles(directory = 'docs/documentation'): string[] {
  return readdirSync(join(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return auditableDocumentationFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

function leafEntries(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value as Messages).flatMap(([key, child]) =>
    leafEntries(child, prefix ? `${prefix}.${key}` : key),
  );
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

test('public and localized product copy excludes every obsolete multi-client claim', () => {
  const auditedCopy = auditableSourceFiles().map((path) => [path, source(path)] as const);

  for (const [path, copy] of auditedCopy) {
    for (const claim of [...OBSOLETE_PRODUCT_CLAIMS, ...UNIVERSAL_LEGAL_CLAIMS]) {
      assert.doesNotMatch(copy, claim, `${path} still contains ${claim}`);
    }
    for (const pattern of VISIBLE_TENANT_SOURCE_PATTERNS) {
      assert.doesNotMatch(copy, pattern, `${path} still renders visible tenant terminology`);
    }
  }
});

test('active documentation excludes stale client ownership contracts', () => {
  const staleContracts = [
    /client_id/iu,
    /linked_client_id/iu,
    /converted_client_id/iu,
    /from\('clients'\)/iu,
    /\/clients/iu,
    /\bAdd Client\b/iu,
    /\bInvite Team Member\b/iu,
    /\b50 to 5,000 clients\b/iu,
  ];

  for (const path of auditableDocumentationFiles()) {
    const copy = source(path);
    for (const contract of staleContracts) {
      assert.doesNotMatch(copy, contract, `${path} still contains ${contract}`);
    }
  }
});

test('assignment copy identifies one-to-one ownership as Mandoob policy', () => {
  assert.match(source('src/components/site/home/ProSuiteSection.tsx'), /Mandoob platform policy/iu);
  assert.match(source('src/lib/pro/public-pro.ts'), /Mandoob platform policy/iu);
  assert.match(source('src/components/site/pro/ProHeroSection.tsx'), /PUBLIC_PRO_CONTENT\.policy/u);
  assert.match(en.admin.companies.assignment.proDescription, /Mandoob platform policy/iu);
  assert.match(en.admin.companies.assignment.proDescription, /one active company assignment/iu);
  assert.match(ar.admin.companies.assignment.proDescription, /سياسة منصة مندوب/u);
  assert.match(ar.admin.companies.assignment.proDescription, /تعيين نشط لشركة واحدة فقط/u);
});

test('legal-claim audit rejects Arabic UAE-law assertions regardless of word order', () => {
  const prohibitedClaims = [
    'القانون الإماراتي يفرض تعيين PRO واحد لكل شركة',
    'مطلوب بموجب قانون دولة الإمارات تعيين PRO واحد لكل شركة',
    'تعيين PRO واحد لكل شركة إلزامي بموجب القانون الإماراتي',
    'تعيين PRO واحد لكل شركة مطلوب وفق قانون دولة الإمارات العربية المتحدة',
  ];

  for (const claim of prohibitedClaims) {
    assert.ok(
      UNIVERSAL_LEGAL_CLAIMS.some((pattern) => pattern.test(claim)),
      `Expected legal-claim audit to reject: ${claim}`,
    );
  }
});

test('localized UI copy reserves tenant wording for internal identifiers', () => {
  for (const [path, value] of leafEntries(en)) {
    assert.doesNotMatch(
      icuLiteralText(value),
      /\btenants?\b/iu,
      `Visible tenant wording remains at en.${path}`,
    );
  }
  for (const [path, value] of leafEntries(ar)) {
    assert.doesNotMatch(
      icuLiteralText(value),
      /المستأجر(?:ون|ين)?/u,
      `Visible tenant wording remains at ar.${path}`,
    );
  }
});

test('PRO hero does not present development counts as platform metrics', () => {
  const hero = source('src/components/site/pro/ProHeroSection.tsx');
  assert.doesNotMatch(hero, />40\+</u);
  assert.doesNotMatch(hero, /active PROs|company workspaces/iu);
});

test('operational product previews stay within the assigned company', () => {
  const bento = source('src/components/site/home/BentoGridSection.tsx');
  const operationalPreview = bento.slice(bento.indexOf('{/* Tile B'), bento.indexOf('{/* Tile D'));
  const renewalFixtures = [...operationalPreview.matchAll(/bento-toast__title">([^<]+)</gu)].map(
    ([, title]) => title,
  );
  const documentFixtures = [...operationalPreview.matchAll(/bento-docs__name">([^<]+)</gu)].map(
    ([, name]) => name,
  );

  assert.ok(operationalPreview.length > 0, 'Expected renewal and document preview fixtures');
  assert.deepEqual(renewalFixtures, [
    'Trade license — Acme Trading',
    'Visa — Sarah Al Marri',
    'Ejari — Acme Trading',
  ]);
  assert.deepEqual(documentFixtures, [
    'trade_license_acme_2026.pdf',
    'passport_sarah.png',
    'moa_acme_trading.pdf',
    'visa_application_jonas.docx',
  ]);
});

test('English and Arabic message trees retain exact keys and ICU variables', () => {
  const englishEntries = leafEntries(en).sort(([left], [right]) => left.localeCompare(right));
  const arabicEntries = leafEntries(ar).sort(([left], [right]) => left.localeCompare(right));

  assert.deepEqual(
    arabicEntries.map(([path]) => path),
    englishEntries.map(([path]) => path),
  );

  for (let index = 0; index < englishEntries.length; index += 1) {
    const [path, englishValue] = englishEntries[index];
    const [, arabicValue] = arabicEntries[index];
    assert.deepEqual(
      icuVariables(arabicValue),
      icuVariables(englishValue),
      `ICU variables differ at ${path}`,
    );
  }
});

test('onboarding copy avoids complete protected identifier examples and universal-law claims', () => {
  for (const [locale, namespace] of [
    ['en', (en as Messages).companyOnboarding],
    ['ar', (ar as Messages).companyOnboarding],
  ] as const) {
    assert.ok(namespace, `Missing ${locale}.companyOnboarding`);
    for (const [path, value] of leafEntries(namespace)) {
      assert.doesNotMatch(value, /\bAE\d{21}\b/u, `${locale}.${path} contains a complete IBAN`);
      assert.doesNotMatch(
        value,
        /\b(?:account|card)[ -]?(?:number)?[^\n]*\d{8,}\b/iu,
        `${locale}.${path} contains a complete protected identifier example`,
      );
      for (const claim of UNIVERSAL_LEGAL_CLAIMS) {
        assert.doesNotMatch(value, claim, `${locale}.${path} contains a universal-law claim`);
      }
    }
  }
});

test('PRO lifecycle sources localize visible copy and never expose raw state, error, or identifiers', () => {
  const paths = [
    'src/app/admin/users/[id]/page.tsx',
    'src/components/admin/ProRegistryTable.tsx',
    'src/components/admin/ProRegistryToolbar.tsx',
    'src/components/admin/ProRegistryAppliedFilters.tsx',
    'src/components/admin/ProCredentialPanel.tsx',
    'src/components/admin/ProCredentialReviewForm.tsx',
    'src/components/admin/ProCommercialTermsPanel.tsx',
    'src/components/admin/ProCommercialTermForm.tsx',
    'src/components/admin/ProLifecycleTimeline.tsx',
    'src/components/account/ProCredentialPanel.tsx',
    'src/components/account/ProCredentialForm.tsx',
    'src/components/account/ProCredentialEvidenceForm.tsx',
  ];
  for (const path of paths) {
    const copy = source(path);
    assert.doesNotMatch(copy, />\s*[A-Z][A-Za-z ]{2,}\s*<\//u, `${path} has visible English`);
    assert.doesNotMatch(
      copy,
      /\{(?:error\.message|error\.stack|response\.statusText)\}/u,
      `${path} renders a raw error`,
    );
    assert.doesNotMatch(
      copy,
      /\bt\((?:status|state|eventKind|reasonCode)\)/u,
      `${path} uses a raw value as a message key`,
    );
    assert.doesNotMatch(
      copy,
      />\s*(?:tenant|client)s?\s*</iu,
      `${path} renders ownership terminology`,
    );
    assert.doesNotMatch(
      copy,
      /\b(?:AE\d{21}|\d{8,})\b/u,
      `${path} contains a complete identifier example`,
    );
  }
});
