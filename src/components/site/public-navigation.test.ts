import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PUBLIC_NAV_ITEMS, isPublicNavCurrent } from './public-navigation';

const rendererSource = readFileSync(new URL('./PublicNavLinks.tsx', import.meta.url), 'utf8');

describe('public navigation contract', () => {
  it('defines the shared navigation destinations in display order', () => {
    assert.deepEqual(PUBLIC_NAV_ITEMS, [
      { id: 'platform', href: '/#services', currentPath: '/' },
      { id: 'estimate', href: '/estimate', currentPath: '/estimate' },
      { id: 'customers', href: '/#customers' },
      { id: 'forPros', href: '/pro', currentPath: '/pro' },
      { id: 'pricing', href: '/pricing', currentPath: '/pricing' },
    ]);
  });

  it('marks Platform current only on the homepage', () => {
    assert.equal(isPublicNavCurrent('/', '/'), true);
    assert.equal(isPublicNavCurrent('/', '/estimate'), false);
  });

  it('never marks Customers current because it has no matcher', () => {
    assert.equal(isPublicNavCurrent(undefined, '/'), false);
    assert.equal(isPublicNavCurrent(undefined, '/customers'), false);
  });

  it('uses exact path matching instead of prefix matching', () => {
    assert.equal(isPublicNavCurrent('/pricing', '/pricing'), true);
    assert.equal(isPublicNavCurrent('/pricing', '/pricing/extra'), false);
  });
});

describe('PublicNavLinks renderer contract', () => {
  it('is the pathname-aware client boundary', () => {
    assert.match(rendererSource, /^'use client';/);
    assert.match(rendererSource, /usePathname/);
  });

  it('applies page semantics through the shared matcher', () => {
    assert.match(rendererSource, /isPublicNavCurrent/);
    assert.match(rendererSource, /aria-current=\{[^}]*['"]page['"]/);
  });

  it('supports an optional navigation callback', () => {
    assert.match(rendererSource, /onNavigate\?/);
    assert.match(rendererSource, /onNavigate\?\.\(\)/);
  });
});
