import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

function source(path: string): string {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

function sectionIds(component: string): string[] {
  return [...component.matchAll(/<section\s+id="([^"]+)"/gu)].map((match) => match[1]);
}

describe('company setup discovery composition contracts', () => {
  const routeCases = [
    ['mainland', 'MainlandDiscovery'],
    ['free-zones', 'FreeZonesDiscovery'],
    ['offshore', 'OffshoreDiscovery'],
  ] as const;

  for (const [route, composition] of routeCases) {
    it(`defines /${route} as a canonical metadata route`, () => {
      const page = source(`src/app/(public)/${route}/page.tsx`);
      assert.match(page, /export const metadata:\s*Metadata/u);
      assert.match(page, new RegExp(`canonical:\\s*'/${route}'`, 'u'));
      assert.match(page, new RegExp(`<${composition}\\s*/>`, 'u'));
      assert.doesNotMatch(page, /['"]use client['"]/u);
    });
  }

  it('keeps the Mainland design-HTML section order and paired panel rows', () => {
    const component = source('src/components/site/company-setup/MainlandDiscovery.tsx');
    assert.deepEqual(sectionIds(component), [
      'setup-hero',
      'mainland-emirates',
      'mainland-activities',
      'mainland-license-cost',
      'mainland-documents-timeline',
      'setup-faq',
    ]);
    assert.equal(component.match(/setup-paired-panels/gu)?.length, 2);
    // Closing band comes from the shared component (renders #setup-conversion).
    assert.match(component, /<SetupCtaBand\b/u);
  });

  it('keeps the Free Zone directory table and design-HTML section order', () => {
    const component = source('src/components/site/company-setup/FreeZonesDiscovery.tsx');
    assert.deepEqual(sectionIds(component), [
      'setup-hero',
      'free-zone-popular',
      'free-zone-directory',
      'free-zone-benefits',
      'free-zone-cost-process',
      'setup-faq',
    ]);
    assert.match(component, /<SetupCtaBand\b/u);
    assert.match(component, /FreeZoneDirectory/u);
    assert.match(source('src/components/site/company-setup/FreeZoneDirectory.tsx'), /<table/u);
  });

  it('keeps the Offshore three-column operations row and reference flow', () => {
    const component = source('src/components/site/company-setup/OffshoreDiscovery.tsx');
    assert.deepEqual(sectionIds(component), [
      'setup-hero',
      'offshore-jurisdictions',
      'offshore-benefits',
      'offshore-process',
      'offshore-operations',
      'setup-faq',
    ]);
    assert.match(component, /setup-operations--three/u);
    assert.match(component, /<SetupCtaBand\b/u);
  });

  it('renders the shared closing band as #setup-conversion', () => {
    const band = source('src/components/site/company-setup/SetupCtaBand.tsx');
    assert.deepEqual(sectionIds(band), ['setup-conversion']);
  });

  it('preserves the individual authority detail route', () => {
    const authorityRoute = 'src/app/(public)/company-setup/[authoritySlug]/page.tsx';
    assert.equal(existsSync(join(root, authorityRoute)), true);
    const page = source(authorityRoute);
    assert.match(page, /generateStaticParams/u);
    assert.match(page, /generateMetadata/u);
    assert.match(page, /JsonLd/u);
    assert.match(page, /relativeEstimateHref/u);
  });
});
