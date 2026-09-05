import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildShellBreadcrumbs,
  resolveActiveShellHref,
  type ShellNavGroup,
} from '@/lib/shell/nav-config';

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
    assert.equal(
      resolveActiveShellHref(groups, '/admin/blog/categories'),
      '/admin/blog/categories',
    );
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

describe('buildShellBreadcrumbs', () => {
  it('uses product labels and authorized links without exposing dynamic segments', () => {
    const crumbs = buildShellBreadcrumbs(
      groups,
      '/admin/pages/550e8400-e29b-41d4-a716-446655440000/edit',
      { label: 'Mandoob', href: '/admin' },
      (_key, fallback) => fallback ?? '',
    );

    assert.deepEqual(crumbs, [{ label: 'Mandoob', href: '/admin' }, { label: 'Pages' }]);
    assert.equal(JSON.stringify(crumbs).includes('550e8400'), false);
  });

  it('marks the role home as current text instead of linking it to itself', () => {
    assert.deepEqual(
      buildShellBreadcrumbs(
        groups,
        '/admin',
        { label: 'Mandoob', href: '/admin' },
        (_key, fallback) => fallback ?? '',
      ),
      [{ label: 'Mandoob' }],
    );
  });
});
