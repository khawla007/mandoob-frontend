import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const read = (file: string) =>
  readFileSync(join(process.cwd(), 'src/components/site/company-setup', file), 'utf8');

describe('company setup shared primitive contracts', () => {
  it('uses a semantic breadcrumb and one identified hero heading on each setup page', () => {
    for (const page of [
      'MainlandDiscovery.tsx',
      'FreeZonesDiscovery.tsx',
      'OffshoreDiscovery.tsx',
    ]) {
      const source = read(page);
      assert.match(source, /<nav[^>]*aria-label="Breadcrumb"/u, page);
      assert.equal(source.match(/<h1\b/gu)?.length, 1, page);
    }
  });

  it('uses semantic lists for process steps', () => {
    assert.match(read('SetupProcess.tsx'), /<ol/u);
  });

  it('uses native FAQ disclosures with explicit heading ownership', () => {
    const source = read('SetupFaq.tsx');
    assert.match(source, /<details/u);
    assert.match(source, /<summary/u);
    assert.match(source, /aria-labelledby=\{headingId\}/u);
  });

  it('uses real conversion links in the shared closing band', () => {
    const conversion = read('SetupCtaBand.tsx');
    assert.equal(conversion.match(/<Link/gu)?.length, 2);
    assert.doesNotMatch(conversion, /href=["']#["']/u);
  });
});
