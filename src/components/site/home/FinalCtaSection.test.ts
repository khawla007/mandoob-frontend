import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const componentSource = readFileSync(new URL('./FinalCtaSection.tsx', import.meta.url), 'utf8');
const publicThemeSource = readFileSync(
  new URL('../../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);

describe('FinalCtaSection background interaction', () => {
  it('uses the localized get-started label', () => {
    assert.match(componentSource, /useTranslations\('home\.finalCta'\)/u);
    assert.match(componentSource, /t\('eyebrow'\)/u);
  });

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

  it('gives the CTA heading a wider readable measure', () => {
    assert.match(
      publicThemeSource,
      /\.site-public \.cta-section__inner\s*\{[^}]*max-width:\s*960px/u,
    );
    assert.match(publicThemeSource, /\.site-public \.display--cta\s*\{[^}]*max-width:\s*18ch/u);
  });

  it('uses a compact, restrained fabric bump', () => {
    assert.match(
      componentSource,
      /params=\{\{\s*sphereRadius:\s*0\.13,\s*deformationStrength:\s*32\s*\}\}/,
    );
  });
});
