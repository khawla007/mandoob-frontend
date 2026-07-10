import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveActiveShellHref, type ShellNavGroup } from '@/lib/shell/nav-config';

const groups: ShellNavGroup[] = [
  {
    labelKey: 'catalog',
    labelFallback: 'Catalog',
    items: [
      {
        labelKey: 'taxonomies',
        labelFallback: 'Taxonomies',
        href: '/admin/blog/categories',
        children: [
          {
            labelKey: 'blogCategories',
            labelFallback: 'Categories',
            href: '/admin/blog/categories',
          },
          {
            labelKey: 'blogAttributes',
            labelFallback: 'Attributes',
            href: '/admin/blog/attributes',
          },
          { labelKey: 'blogTags', labelFallback: 'Tags', href: '/admin/blog/tags' },
        ],
      },
    ],
  },
  {
    labelKey: 'editorial',
    labelFallback: 'Editorial',
    items: [
      { labelKey: 'blog', labelFallback: 'Blog', href: '/admin/blog' },
      { labelKey: 'pages', labelFallback: 'Pages', href: '/admin/pages' },
    ],
  },
];

describe('resolveActiveShellHref', () => {
  it('chooses the deepest matching route for nested blog taxonomy pages', () => {
    assert.equal(resolveActiveShellHref(groups, '/admin/blog'), '/admin/blog');
    assert.equal(resolveActiveShellHref(groups, '/admin/blog/categories'), '/admin/blog/categories');
    assert.equal(
      resolveActiveShellHref(groups, '/admin/blog/categories/child'),
      '/admin/blog/categories',
    );
  });

  it('keeps Pages active on its child edit routes', () => {
    assert.equal(resolveActiveShellHref(groups, '/admin/pages'), '/admin/pages');
    assert.equal(resolveActiveShellHref(groups, '/admin/pages/new'), '/admin/pages');
    assert.equal(resolveActiveShellHref(groups, '/admin/pages/page-id/edit'), '/admin/pages');
  });
});
