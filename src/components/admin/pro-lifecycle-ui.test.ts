import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

test('PRO mode reuses Users page with exact count, applied filters, reset, and deterministic pages', () => {
  const page = read('src/app/admin/users/page.tsx');
  assert.match(page, /sp\.role === 'pro'/u);
  assert.match(page, /Array\.isArray\(sp\.role\)/u);
  assert.match(page, /listProRegistry/u);
  assert.match(page, /total/u);
  assert.match(page, /ProRegistryAppliedFilters/u);
  assert.match(page, /ProRegistryPagination/u);
  assert.match(page, /UsersEmptyState[\s\S]*resetHref/u);
  assert.match(page, /result\.page === filters\.page[\s\S]*canonicalFilters/u);
  assert.match(page, /ProRegistryPagination filters=\{canonicalFilters\}/u);
});

test('PRO registry table links to detail and exposes semantic sorting plus narrow scroll', () => {
  const table = read('src/components/admin/ProRegistryTable.tsx');
  assert.match(table, /aria-sort/u);
  assert.match(table, /\/admin\/users\/\$\{row\.id\}/u);
  assert.doesNotMatch(table, /\/edit/u);
  assert.match(table, /role="region"/u);
  assert.match(table, /aria-label/u);
  assert.match(table, /overflow-x-auto/u);
});

test('generic user rows retain edit links while PRO rows never paginate in client memory', () => {
  assert.match(read('src/components/admin/UsersTable.tsx'), /\/admin\/users\/\$\{r\.id\}\/edit/u);
  const registry = read('src/lib/data/pro-registry.ts');
  assert.equal((registry.match(/\.rpc\(/gu) ?? []).length, 1);
  assert.doesNotMatch(registry, /auth\.admin|\.slice\(|getUserById|listUsers/u);
});
