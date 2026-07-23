import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const componentSource = readFileSync(new URL('./FabricBackground.tsx', import.meta.url), 'utf8');

describe('FabricBackground mesh deformation', () => {
  it('compensates outward perspective and pulls the pattern toward center', () => {
    assert.doesNotMatch(componentSource, /lateralFalloff/);
    assert.match(componentSource, /const CAMERA_DISTANCE = 6;/);
    assert.match(
      componentSource,
      /const perspectiveScale = Math\.max\(\s*0\.05,\s*\(CAMERA_DISTANCE - height\) \/ CAMERA_DISTANCE,\s*\);/,
    );
    assert.match(componentSource, /const inwardScale = Math\.min\(height \* 0\.05, 0\.12\);/);
    assert.match(
      componentSource,
      /position\.setXYZ\(\s*i,\s*basePositions\[i \* 3\] \* \(perspectiveScale - inwardScale\),\s*basePositions\[i \* 3 \+ 1\] \* perspectiveScale,\s*height,\s*\)/,
    );
  });
});
