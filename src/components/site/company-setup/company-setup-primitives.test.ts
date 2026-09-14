import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const read = (file: string) =>
  readFileSync(join(process.cwd(), 'src/components/site/company-setup', file), 'utf8');

describe('company setup shared primitive contracts', () => {
  it('uses a semantic breadcrumb and one identified hero heading', () => {
    const source = read('SetupHero.tsx');
    assert.match(source, /<nav[^>]*aria-label="Breadcrumb"/u);
    assert.match(source, /<h1 id=\{headingId\}/u);
    assert.match(source, /<Image/u);
    assert.match(source, /sizes=/u);
    assert.doesNotMatch(source, /href=["']#["']/u);
  });

  it('uses semantic lists for benefits and process steps', () => {
    assert.match(read('SetupBenefitStrip.tsx'), /<ul/u);
    assert.match(read('SetupProcess.tsx'), /<ol/u);
  });

  it('uses native FAQ disclosures with explicit heading ownership', () => {
    const source = read('SetupFaq.tsx');
    assert.match(source, /<details/u);
    assert.match(source, /<summary/u);
    assert.match(source, /aria-labelledby=\{headingId\}/u);
  });

  it('uses semantic panels and real conversion links', () => {
    assert.match(read('SetupPanel.tsx'), /<article/u);
    const conversion = read('SetupConversionBand.tsx');
    assert.equal(conversion.match(/<Link/gu)?.length, 2);
    assert.doesNotMatch(conversion, /href=["']#["']/u);
  });
});
