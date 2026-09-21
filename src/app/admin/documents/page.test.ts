import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const page = readFileSync(join(process.cwd(), 'src/app/admin/documents/page.tsx'), 'utf8');

test('admin documents page authorizes directly before search, translations, or data access', () => {
  const authorize = page.indexOf('await requirePlatformOperator()');
  assert.ok(authorize >= 0);
  for (const boundary of ['searchParams', 'getTranslations(', 'listAdminDocumentCenter(']) {
    assert.ok(
      page.indexOf(boundary, authorize + 1) > authorize,
      `${boundary} must follow authorization`,
    );
  }
});

test('admin documents page is URL-driven, read-only, and renders explicit source states', () => {
  assert.match(page, /parseAdminDocumentCenterQuery/u);
  assert.match(page, /adminDocumentCenterHref/u);
  assert.match(page, /result\.kind === 'error'/u);
  assert.match(page, /result\.kind === 'empty'/u);
  assert.match(page, /<Table/u);
  assert.doesNotMatch(
    page,
    /AdminOversightWorkspace|reviewDocument|createDocumentRequest|download|signedUrl/iu,
  );
  assert.doesNotMatch(page, /<form[^>]+action=|action=\{|useActionState|useTransition/iu);
});

test('admin document dates and timestamps use the Dubai operational timezone', () => {
  assert.equal(page.match(/timeZone: 'Asia\/Dubai'/gu)?.length, 2);
  assert.match(
    page,
    /const dateTime = new Intl\.DateTimeFormat\(locale, \{\s*timeZone: 'Asia\/Dubai',[\s\S]*?timeStyle: 'short',\s*\}\)/u,
  );
  assert.match(
    page,
    /const date = new Intl\.DateTimeFormat\(locale, \{\s*timeZone: 'Asia\/Dubai',[\s\S]*?dateStyle: 'medium',\s*\}\)/u,
  );
});

test('admin document center messages keep exact English and Arabic shape parity', () => {
  const en = JSON.parse(readFileSync(join(process.cwd(), 'src/messages/en.json'), 'utf8')).admin
    .management.documents;
  const ar = JSON.parse(readFileSync(join(process.cwd(), 'src/messages/ar.json'), 'utf8')).admin
    .management.documents;
  const shape = (value: unknown): unknown =>
    value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, child]) => [
            key,
            shape(child),
          ]),
        )
      : typeof value;
  assert.deepEqual(shape(ar), shape(en));
});
