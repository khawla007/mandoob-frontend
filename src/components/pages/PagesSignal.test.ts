import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path: string) => readFileSync(path, 'utf8');
test('Pages opts in only after inspection and retains direct authorization and original pagination', () => {
  for (const path of [
    'src/app/admin/pages/page.tsx',
    'src/app/admin/pages/new/page.tsx',
    'src/app/admin/pages/[id]/page.tsx',
  ]) {
    const page = read(path);
    assert.match(
      page,
      /admin-management-signal pages-management-workspace admin-editorial-workspace/,
    );
    assert.match(page, /await requireRole\('super_admin', 'admin'\)/);
    assert.equal((page.match(/<h1/g) ?? []).length, 1);
    assert.doesNotMatch(page, /signal-kpi|signal-panel|LIVE/);
  }
  const page = read('src/app/admin/pages/page.tsx');
  assert.match(page, /listAdminCmsPages\(\{ page: requestedPage, pageSize: 8 \}\)/);
  assert.match(page, /clampAdminPage\(rawPage, result.total, result.pageSize\)/);
  assert.doesNotMatch(page, /overflow-x-auto/);
});
test('Pages table owns one named keyboard region with logical readable columns and unchanged confirmation', () => {
  const table = read('src/components/pages/PagesTable.tsx');
  assert.match(table, /<Table scrollAreaLabel=\{t\('caption'\)\}/);
  assert.equal((table.match(/TableHead className="text-start"/g) ?? []).length, 5);
  assert.match(table, /TableHead className="text-end"/);
  assert.match(table, /whitespace-normal/);
  assert.match(table, /deleteCmsPageAction\(target.id\)/);
  assert.match(table, /role="alertdialog"/);
  assert.match(table, /invokerRef.current\?\.focus\(\)/);
  assert.match(table, /dialogTabDestination/);
  assert.match(table, /key === 'Escape' && !pendingRef.current/);
});
test('Pages shares verified editorial geometry and keeps hero payloads and script fields', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /\.admin-editorial-workspace \[data-slot='card'\]/);
  assert.match(css, /\.pages-management-workspace \.pages-delete-dialog/);
  assert.match(css, /max-height: calc\(100dvh - 2rem\)/);
  const editor = read('src/components/pages/PageEditor.tsx');
  assert.match(editor, /contentLabel=\{t\('content'\)\}/);
  assert.match(editor, /saveCmsPageAction\(page\?.id \?\? null, data\)/);
  for (const name of ['scriptHead', 'scriptBodyStart', 'scriptBodyEnd', 'schemaMarkup', 'noindex'])
    assert.match(editor, new RegExp('name="' + name + '"'));
  assert.doesNotMatch(editor, /termIds|galleryMediaIds|featuredMediaId/);
});
