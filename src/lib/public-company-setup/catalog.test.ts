import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authoritySetupPages } from '@/lib/knowledge-base';
import {
  FREE_ZONE_DIRECTORY,
  MAINLAND_EMIRATES,
  OFFSHORE_OPTIONS,
  POPULAR_FREE_ZONES,
  formatIndicativeAed,
} from './catalog';

describe('public company setup catalog', () => {
  it('provides the exact approved discovery counts without inventing Offshore authorities', () => {
    assert.equal(MAINLAND_EMIRATES.length, 7);
    assert.equal(POPULAR_FREE_ZONES.length, 6);
    assert.equal(OFFSHORE_OPTIONS.length, 3);
    assert.equal(OFFSHORE_OPTIONS.filter((item) => item.authoritySlug).length, 2);
    assert.equal(OFFSHORE_OPTIONS.some((item) => /ajman offshore/iu.test(item.name)), false);
  });

  it('resolves every authority card to the accepted detail catalog', () => {
    const accepted = new Set(authoritySetupPages.map((page) => page.slug));
    for (const item of [...POPULAR_FREE_ZONES, ...OFFSHORE_OPTIONS]) {
      if (!item.authoritySlug) continue;
      assert.equal(accepted.has(item.authoritySlug), true, item.authoritySlug);
      assert.equal(item.href, `/company-setup/${item.authoritySlug}`);
    }
  });

  it('keeps deterministic ordering, safe relative URLs, and explicit indicative cost labels', () => {
    assert.deepEqual(
      POPULAR_FREE_ZONES.map((item) => item.name),
      ['DMCC', 'JAFZA', 'IFZA', 'RAKEZ', 'SHAMS', 'Meydan Free Zone'],
    );
    assert.ok(MAINLAND_EMIRATES.every((item) => item.href.startsWith('/estimate?')));
    assert.ok(FREE_ZONE_DIRECTORY.every((item) => item.costLabel.startsWith('Indicative AED ')));
    assert.equal(formatIndicativeAed(1_250_000, 2_100_000), 'Indicative AED 12,500–21,000');
  });

  it('does not publish unsupported proof or guarantees', () => {
    const content = JSON.stringify({
      mainland: MAINLAND_EMIRATES,
      popular: POPULAR_FREE_ZONES,
      directory: FREE_ZONE_DIRECTORY,
      offshore: OFFSHORE_OPTIONS,
    });
    assert.doesNotMatch(
      content,
      /45\+|0% tax|tax[- ]free|guaranteed|full confidentiality|no audit|bank account guaranteed|global recognition/iu,
    );
  });
});
