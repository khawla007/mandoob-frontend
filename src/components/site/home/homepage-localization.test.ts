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

  it('keeps the protected 07 label on the final section', () => {
    assert.equal(valueAt((en as Catalog).home, 'finalCta.eyebrow'), '07 · Get started');
    assert.equal(valueAt((ar as Catalog).home, 'finalCta.eyebrow'), '07 · ابدأ');
  });

  it('uses non-numbered labels for major homepage sections', () => {
    for (const path of [
      'services.eyebrow',
      'flow.eyebrow',
      'estimator.eyebrow',
      'knowledge.eyebrow',
      'faq.eyebrow',
    ]) {
      assert.doesNotMatch(valueAt((en as Catalog).home, path) as string, /^\d/u);
      assert.doesNotMatch(valueAt((ar as Catalog).home, path) as string, /^\d/u);
    }
  });

  it('defines the reference feature-row, testimonial and contact copy in both catalogs', () => {
    for (const catalog of [en, ar]) {
      const home = (catalog as Catalog).home;
      for (const path of [
        'confidence.title',
        'confidence.eyebrow',
        'confidence.lede',
        'confidence.setupTitle',
        'confidence.guidanceText',
        'beyond.title',
        'beyond.lede',
        'beyond.expertTitle',
        'beyond.secureText',
        'testimonials.eyebrow',
        'testimonials.title',
        'testimonials.lede',
        'flow.lede',
        'testimonials.item1Quote',
        'contactStrip.readyTitle',
        'contactStrip.callLabel',
        'knowledge.card1Tag',
      ]) {
        assert.equal(typeof valueAt(home, path), 'string', path);
      }
      assert.equal(valueAt(home, 'why'), undefined);
      assert.equal(valueAt(home, 'applyChecklist'), undefined);
    }
  });
});
