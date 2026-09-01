import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FREE_ZONE_DIRECTORY } from './catalog';
import { EMPTY_FILTERS, filterFreeZones } from './filter';

describe('Free Zone directory filtering', () => {
  it('searches case-insensitively without mutating deterministic order', () => {
    const source = [...FREE_ZONE_DIRECTORY];
    const result = filterFreeZones(source, { ...EMPTY_FILTERS, query: 'dmcc' });
    assert.deepEqual(result.map((item) => item.name), ['DMCC']);
    assert.deepEqual(source, FREE_ZONE_DIRECTORY);
  });

  it('combines emirate, business, office, and budget filters', () => {
    const result = filterFreeZones(FREE_ZONE_DIRECTORY, {
      query: '',
      emirate: 'ras_al_khaimah',
      businessType: 'commercial',
      officeType: 'flexi',
      budget: 'under_15000',
    });
    assert.deepEqual(result.map((item) => item.name), ['RAKEZ']);
  });

  it('returns an empty list for an unsupported combination and all rows after clear', () => {
    assert.deepEqual(
      filterFreeZones(FREE_ZONE_DIRECTORY, {
        ...EMPTY_FILTERS,
        emirate: 'sharjah',
        officeType: 'physical',
      }),
      [],
    );
    assert.deepEqual(filterFreeZones(FREE_ZONE_DIRECTORY, EMPTY_FILTERS), FREE_ZONE_DIRECTORY);
  });
});
