import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

type Catalog = Record<string, unknown>;

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value as Catalog).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function valueAt(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return (value as Catalog)[key];
  }, root);
}

describe('homepage localization contract', () => {
  it('keeps exact English/Arabic key parity with natural Arabic copy', () => {
    const englishHome = (en as Catalog).home;
    const arabicHome = (ar as Catalog).home;
    assert.ok(englishHome, 'Missing en.home catalog');
    assert.ok(arabicHome, 'Missing ar.home catalog');

    const englishPaths = leafPaths(englishHome).sort();
    const arabicPaths = leafPaths(arabicHome).sort();
    assert.deepEqual(arabicPaths, englishPaths);

    for (const path of englishPaths) {
      const englishValue = valueAt(englishHome, path);
      const arabicValue = valueAt(arabicHome, path);
      assert.equal(typeof englishValue, 'string', `en.home.${path} must be a string`);
      assert.equal(typeof arabicValue, 'string', `ar.home.${path} must be a string`);
      assert.match(arabicValue as string, /[\u0600-\u06ff]/u, `ar.home.${path} needs Arabic copy`);
    }
  });

  it('retains the protected final section number and English label', () => {
    assert.equal(valueAt((en as Catalog).home, 'finalCta.eyebrow'), '07 · Get started');
    assert.match(valueAt((ar as Catalog).home, 'finalCta.eyebrow') as string, /^07 · /u);
  });
});
