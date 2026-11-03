import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const source = (name: string) =>
  readFileSync(join(root, 'src/components/site/company-setup', name), 'utf8');

describe('company setup discovery page contracts', () => {
  it('does not nest a second main landmark inside the public layout', () => {
    for (const name of [
      'MainlandDiscovery.tsx',
      'FreeZonesDiscovery.tsx',
      'OffshoreDiscovery.tsx',
    ]) {
      assert.doesNotMatch(source(name), /<main\b/u, name);
    }
  });

  it('renders mainland emirates, activities, cost guidance, documents, timeline, and CTAs', () => {
    const page = source('MainlandDiscovery.tsx');
    for (const term of [
      'MAINLAND_EMIRATES',
      'Commercial',
      'Professional',
      'Industrial',
      'Tourism',
      'Mainland License Types',
      'Estimated Setup Cost',
      'Required Documents',
      'Estimated Timeline',
      'Ready to Start Your Mainland Business',
    ])
      assert.match(page, new RegExp(term));
  });

  it('renders a client-filtered Free Zone directory and comparison guidance', () => {
    const page = source('FreeZonesDiscovery.tsx');
    const directory = source('FreeZoneDirectory.tsx');
    for (const term of [
      'POPULAR_FREE_ZONES',
      'FREE_ZONE_DIRECTORY',
      'Mainland and Free Zone',
      'SetupProcess',
    ]) {
      assert.match(page, new RegExp(term));
    }
    assert.match(directory, /^'use client';/u);
    for (const term of [
      'filterFreeZones',
      'Search by name',
      'type="search"',
      'Apply filters',
      'Clear filters',
      'aria-label="Free Zone comparison results"',
      'tabIndex={0}',
      '<caption',
      'formatFreeZoneResultCount',
      'filtersAreApplied',
      '<table',
    ]) {
      assert.match(directory, new RegExp(term));
    }
  });

  it('renders honest offshore options, qualification, process, and limitations', () => {
    const page = source('OffshoreDiscovery.tsx');
    for (const term of [
      'OFFSHORE_OPTIONS',
      'OFFSHORE_PLANNING',
      'Is offshore suitable',
      'Key Benefits of Offshore Companies',
      'Will incorporation secure a bank account',
      'Can an offshore company sponsor UAE residence visas',
      'SetupProcess',
      'setup-operations--three',
    ])
      assert.match(page, new RegExp(term));
    assert.doesNotMatch(page, /guaranteed|tax[- ]free|zero tax/iu);
  });
});
