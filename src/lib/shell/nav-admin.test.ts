import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { adminNav } from './nav-admin';

const source = readFileSync(join(process.cwd(), 'src/lib/shell/nav-admin.ts'), 'utf8');

function groupSource(labelKey: string) {
  const start = source.indexOf(`labelKey: '${labelKey}'`);
  assert.notEqual(start, -1, `Missing admin nav group ${labelKey}`);
  const nextGroup = source.indexOf('\n  {', start + 1);
  return nextGroup === -1 ? source.slice(start) : source.slice(start, nextGroup);
}

function groupHrefs(labelKey: string) {
  const group = adminNav.find((candidate) => candidate.labelKey === labelKey);
  assert.ok(group, `Missing admin nav group ${labelKey}`);
  return group.items.map((item) => item.href);
}

describe('adminNav', () => {
  it('uses the approved CMS section order', () => {
    assert.deepEqual(
      adminNav.map((group) => group.labelKey ?? 'overview'),
      ['overview', 'catalog', 'editorial', 'business', 'tenants', 'authSecurity', 'account'],
    );
  });

  it('keeps catalog, business, and authentication routes in their own sections', () => {
    assert.deepEqual(groupHrefs('catalog'), ['/admin/cost-data', '/admin/blog/categories']);
    assert.deepEqual(groupHrefs('business'), [
      '/admin/leads',
      '/admin/finance',
      '/admin/whatsapp-templates',
    ]);
    assert.deepEqual(groupHrefs('authSecurity'), [
      '/admin/users',
      '/admin/sessions',
      '/admin/security',
      '/admin/audit-logs',
      '/admin/erasure-requests',
    ]);
  });

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
