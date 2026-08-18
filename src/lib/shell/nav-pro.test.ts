import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/lib/shell/nav-pro.ts'), 'utf8');

function hrefsFor(slug: string): string[] {
  return [...source.matchAll(/href: `\$\{base\}([^`]+)`/g)].map((match) => `/t/${slug}${match[1]}`);
}

test('PRO navigation exposes exactly one Assigned Company route before Applications', () => {
  const hrefs = hrefsFor('acme');

  assert.equal(hrefs.filter((href) => href === '/t/acme/company').length, 1);
  assert.equal(hrefs.filter((href) => href === '/t/acme/applications').length, 1);
  assert.equal(hrefs.indexOf('/t/acme/applications'), hrefs.indexOf('/t/acme/company') + 1);
});

test('PRO navigation removes client directory, import, and team routes', () => {
  const hrefs = hrefsFor('acme');
  const legacyDirectory = `/t/acme/${['cli', 'ents'].join('')}`;
  assert.equal(
    hrefs.some((href) => href === legacyDirectory),
    false,
  );
  assert.equal(
    hrefs.some((href) => href === `${legacyDirectory}/import`),
    false,
  );
  assert.equal(
    hrefs.some((href) => href === '/t/acme/team'),
    false,
  );
  assert.deepEqual(hrefs, [
    '/t/acme/dashboard',
    '/t/acme/company',
    '/t/acme/applications',
    '/t/acme/leads',
    '/t/acme/meetings',
    '/t/acme/renewals',
    '/t/acme/documents',
    '/t/acme/payments',
    '/t/acme/employees',
    '/t/acme/settings',
  ]);
});

test('PRO dashboard navigation is localized as Command Center', () => {
  assert.match(source, /labelKey: 'commandCenter'/);
  assert.match(source, /labelFallback: 'Command Center'/);
});
