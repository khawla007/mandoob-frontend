import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/lib/shell/nav-admin.ts'), 'utf8');

function groupSource(labelKey: string) {
  const start = source.indexOf(`labelKey: '${labelKey}'`);
  assert.notEqual(start, -1, `Missing admin nav group ${labelKey}`);
  const nextGroup = source.indexOf('\n  {', start + 1);
  return nextGroup === -1 ? source.slice(start) : source.slice(start, nextGroup);
}

describe('adminNav', () => {
  it('keeps blog management out of the Auth group and under Editorial', () => {
    const auth = groupSource('auth');
    const editorial = groupSource('editorial');

    assert.equal(auth.includes("labelKey: 'blog'"), false);
    assert.match(editorial, /labelKey: 'blog'[\s\S]+href: '\/admin\/blog'/);
  });

  it('puts Pages after Blog under Editorial and nowhere else', () => {
    const auth = groupSource('auth');
    const catalog = groupSource('catalog');
    const editorial = groupSource('editorial');

    assert.equal(auth.includes("labelKey: 'pages'"), false);
    assert.equal(catalog.includes("labelKey: 'pages'"), false);
    assert.match(
      editorial,
      /labelKey: 'blog'[\s\S]+labelKey: 'pages'[\s\S]+href: '\/admin\/pages'/,
    );
  });

  it('puts blog taxonomy children in a Catalog taxonomy dropdown', () => {
    const catalog = groupSource('catalog');
    const taxonomyStart = catalog.indexOf("labelKey: 'taxonomies'");

    assert.notEqual(taxonomyStart, -1, 'Missing Taxonomies item');
    assert.match(catalog, /labelKey: 'taxonomies'[\s\S]+children:/);
    assert.match(catalog, /labelKey: 'blogCategories'[\s\S]+href: '\/admin\/blog\/categories'/);
    assert.match(catalog, /labelKey: 'blogAttributes'[\s\S]+href: '\/admin\/blog\/attributes'/);
    assert.match(catalog, /labelKey: 'blogTags'[\s\S]+href: '\/admin\/blog\/tags'/);
  });
});
