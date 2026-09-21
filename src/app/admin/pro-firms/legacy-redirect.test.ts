import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('legacy list and create bookmarks redirect to the canonical Companies routes', () => {
  assert.match(source('src/app/admin/pro-firms/page.tsx'), /redirect\('\/admin\/companies'\)/u);
  assert.match(
    source('src/app/admin/pro-firms/new/page.tsx'),
    /redirect\('\/admin\/companies\/new'\)/u,
  );
});

test('legacy tenant UUID bookmark redirects to the validated company tenant filter', () => {
  const detail = source('src/app/admin/pro-firms/[id]/page.tsx');
  assert.match(detail, /if \(!isUuid\(id\)\) notFound\(\)/u);
  assert.match(detail, /\/admin\/companies\?tenant=\$\{encodeURIComponent\(id\)\}/u);
  assert.doesNotMatch(detail, /\/admin\/companies\/\$\{id\}/u);
});

test('Admin navigation exposes Companies without resurrecting PRO firms', () => {
  const nav = source('src/lib/shell/nav-admin.ts');
  assert.match(nav, /labelKey: 'companies'[\s\S]+href: '\/admin\/companies'/u);
  assert.doesNotMatch(nav, /\/admin\/pro-firms/u);
});
