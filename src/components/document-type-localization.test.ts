import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { createTranslator } from 'use-intl/core';

import ar from '@/messages/ar.json';
import en from '@/messages/en.json';
import { DOC_TYPES } from '@/lib/validation/document';

const COMPONENTS = [
  'src/components/customer/ActiveDocRequestsCard.tsx',
  'src/components/customer/DocumentRequestRow.tsx',
  'src/components/pro/documents/RequestDocumentDialog.tsx',
] as const;

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('document type localization render contracts run under the client React export condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

renderTest(
  'all supported document types render from complete English and Arabic catalogs',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const catalogs = [
      { locale: 'en', messages: en, dir: 'ltr' },
      { locale: 'ar', messages: ar, dir: 'rtl' },
    ] as const;

    for (const catalog of catalogs) {
      const namespaces = [
        {
          name: 'customer.docTypeLabels' as const,
          entries: catalog.messages.customer.docTypeLabels,
        },
        {
          name: 'proDocumentCenter.docTypes' as const,
          entries: catalog.messages.proDocumentCenter.docTypes,
        },
      ];

      for (const namespace of namespaces) {
        assert.deepEqual(
          Object.keys(namespace.entries).sort(),
          [...DOC_TYPES].sort(),
          `${catalog.locale}:${namespace.name} must contain exactly the supported document types`,
        );

        const translate = createTranslator({
          locale: catalog.locale,
          messages: catalog.messages,
          namespace: namespace.name,
        });
        const labels = DOC_TYPES.map((type) => translate(type));
        const html = renderToStaticMarkup(
          React.createElement(
            'ul',
            { dir: catalog.dir, lang: catalog.locale },
            labels.map((label, index) =>
              React.createElement('li', { key: DOC_TYPES[index] }, label),
            ),
          ),
        );

        assert.equal(labels.length, 15);
        assert.equal(new Set(labels).size, 15);
        assert.equal((html.match(/<li>/gu) ?? []).length, 15);
        for (const label of labels) {
          assert.notEqual(label, '');
          if (catalog.locale === 'ar') {
            assert.match(label, /[\u0600-\u06ff]/u, `Expected Arabic label, received: ${label}`);
          }
          assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
        }
      }
    }
  },
);

test('live document components resolve type labels through next-intl without local label maps', () => {
  const sources = Object.fromEntries(
    COMPONENTS.map((file) => [file, readFileSync(join(process.cwd(), file), 'utf8')]),
  );

  for (const [file, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /DOC_TYPE_LABELS/u, `${file} still declares a local label map`);
    assert.doesNotMatch(
      source,
      /passport:\s*['"]Passport['"]/u,
      `${file} still embeds English document labels`,
    );
  }

  assert.match(
    sources['src/components/customer/DocumentRequestRow.tsx'],
    /getTranslations\('customer\.docTypeLabels'\)/u,
  );
  assert.match(
    sources['src/components/customer/ActiveDocRequestsCard.tsx'],
    /getTranslations\('customer\.docTypeLabels'\)/u,
  );
  assert.match(
    sources['src/components/pro/documents/RequestDocumentDialog.tsx'],
    /labels\.docTypes\[type\]/u,
  );
});
