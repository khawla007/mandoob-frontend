import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/lib/shell/nav-pro.ts'), 'utf8');

function hrefsFor(slug: string): string[] {
  return [...source.matchAll(/href: `\$\{base\}([^`]+)`/g)].map((match) => `/t/${slug}${match[1]}`);
}

test('PRO navigation adds exactly one Applications item immediately after Clients', () => {
  const hrefs = hrefsFor('acme');

  assert.equal(hrefs.filter((href) => href === '/t/acme/applications').length, 1);
  assert.equal(hrefs.indexOf('/t/acme/applications'), hrefs.indexOf('/t/acme/clients') + 1);
});

test('PRO navigation retains every pre-existing route', () => {
  const hrefs = hrefsFor('acme');
  assert.deepEqual(
    hrefs.filter((href) => href !== '/t/acme/applications'),
    [
      '/t/acme/dashboard',
      '/t/acme/clients',
      '/t/acme/leads',
      '/t/acme/meetings',
      '/t/acme/renewals',
      '/t/acme/documents',
      '/t/acme/payments',
      '/t/acme/employees',
      '/t/acme/settings',
    ],
  );
});
