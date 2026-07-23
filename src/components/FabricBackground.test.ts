import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const componentSource = readFileSync(new URL('./FabricBackground.tsx', import.meta.url), 'utf8');
const publicThemeSource = readFileSync(
  new URL('../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);

describe('FabricBackground mesh deformation', () => {
  it('keeps the bump centered on the cursor without section-center bias', () => {
    assert.doesNotMatch(componentSource, /lateralFalloff|inwardScale/);
    assert.match(componentSource, /const CAMERA_DISTANCE = 6;/);
    assert.match(
      componentSource,
      /const perspectiveScale = Math\.max\(\s*0\.05,\s*\(CAMERA_DISTANCE - height\) \/ CAMERA_DISTANCE,\s*\);/,
    );
    assert.match(
      componentSource,
      /position\.setXYZ\(\s*i,\s*basePositions\[i \* 3\] \* perspectiveScale,\s*basePositions\[i \* 3 \+ 1\] \* perspectiveScale,\s*height,\s*\)/,
    );
  });

  it('matches the static pattern scale and replaces it only when WebGL is active', () => {
    assert.doesNotMatch(componentSource, /textureRepeat\?:/);
    assert.match(componentSource, /textureAspect = 1774 \/ 887/);
    assert.match(
      componentSource,
      /const textureRepeat = useMemo\(\s*\(\) => new THREE\.Vector2\(size\.width \/ size\.height \/ textureAspect, 1\),\s*\[size\.height, size\.width, textureAspect\],\s*\);/,
    );
    assert.match(
      publicThemeSource,
      /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\.site-public \.cta-section:has\(\.fabric-background\)[\s\S]*?background-image: none;/,
    );
  });
});
