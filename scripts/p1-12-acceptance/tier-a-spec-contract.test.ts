import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('direct and client-navigation cases reuse the same complete HTML gate', () => {
  const source = readFileSync('tests/p1-12-acceptance/tier-a.spec.ts', 'utf8');
  assert.equal(source.match(/await expectCompleteP112HtmlGate\(/gu)?.length, 2);
  const helperStart = source.indexOf('async function expectCompleteP112HtmlGate');
  const directStart = source.indexOf('for (const route of P112_TIER_A_RENDERED_CASES', helperStart);
  const helper = source.slice(helperStart, directStart);
  const cases = source.slice(directStart);
  for (const marker of [
    'document.fonts.status',
    'accepted public shell wrappers',
    'expectedOgTitle',
    "value['headline']",
    'themeSurface',
    'axe-lower-severity-findings',
  ]) {
    assert.match(helper, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), marker);
    assert.doesNotMatch(
      cases,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
      marker,
    );
  }
  assert.match(source.slice(0, directStart), /required body text clipped/u);
  assert.equal(source.slice(0, directStart).match(/getClientRects\(\)/gu)?.length, 2);
  assert.match(source.slice(0, directStart), /Number\.parseFloat\(style\.opacity\) === 0/u);
  assert.match(source.slice(0, directStart), /closest\('\.swiper-slide'\)/u);
  assert.match(helper, /window\.setTimeout\(resolve, 250\)/u);
  assert.match(source.slice(0, directStart), /focus ring clipped/u);
  assert.match(source.slice(0, directStart), /window\.scrollTo\(0, 0\)/u);
  assert.match(source.slice(0, directStart), /Math\.max\(outlineWidth \+ outlineOffset, 0\)/u);
  assert.match(helper, /manifest-backed theme surface/u);
  assert.match(helper, /parseP112RobotsMetadata/u);
  assert.match(helper, /route\.expectedStatus === 404/u);
  assert.doesNotMatch(helper, /meta\[name="robots"\]\s*'\)\.getAttribute/u);
  assert.match(source, /requestfailed/gu);
  assert.match(source, /maxRedirects:\s*0/gu);
  assert.doesNotMatch(source, /toBeLessThan\(400\)/u);
  assert.doesNotMatch(source, /stateId:\s*'S001'/u);
  assert.match(source, /expectInternalDestinations\(page, route, stateId\)/u);
  assert.doesNotMatch(source, /filesUnder\('\.next\/static'/u);
  assert.match(source, /p112DestinationProbeStrategy/u);
  assert.doesNotMatch(
    source,
    /journey\.consumedContext|getByRole\('button', \{ name: 'Back' \}\)/u,
  );
  assert.match(source, /locator\('\.setup-page'\)[\s\S]*\.count/u);
  assert.match(source, /setupPage \? '#ff5722'/u);
  assert.match(
    source,
    /expect\(page\.locator\(route!\.sections\[0\]!\)\)[\s\S]*toHaveCount\(1\)[\s\S]*public-content-loading:visible[\s\S]*toHaveCount\(0\)[\s\S]*await settle\(page\)/u,
  );
});
