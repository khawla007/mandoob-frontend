import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const componentSource = readFileSync(new URL('./FinalCtaSection.tsx', import.meta.url), 'utf8');

describe('FinalCtaSection background interaction', () => {
  it('uses the fabric mesh background without old fake hover layers', () => {
    assert.match(componentSource, /'use client'/);
    assert.doesNotMatch(componentSource, /cta-section__panel/);
    assert.doesNotMatch(componentSource, /cta-section__blob/);
    assert.doesNotMatch(componentSource, /<canvas/);
    assert.match(componentSource, /FabricBackground/);
    assert.match(componentSource, /useMouse/);
    assert.match(componentSource, /onPointerMove/);
    assert.match(componentSource, /onPointerLeave/);
    assert.doesNotMatch(componentSource, /cta-section--honeycomb/);
    assert.doesNotMatch(componentSource, /cta-h-honeycomb/);
    assert.doesNotMatch(componentSource, /cta-final-honeycomb/);
    assert.doesNotMatch(componentSource, /\/images\/cta-honeycomb\.svg/);
  });

  it('uses a compact, restrained fabric bump', () => {
    assert.match(
      componentSource,
      /params=\{\{\s*sphereRadius:\s*0\.13,\s*deformationStrength:\s*32\s*\}\}/,
    );
  });
});
