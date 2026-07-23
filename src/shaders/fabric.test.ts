import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fabricFragmentShader } from './fabric';

describe('fabric fragment shader', () => {
  it('keeps bump shading neutral without warm yellow tint colors', () => {
    assert.doesNotMatch(fabricFragmentShader, /lineHighlight/);
    assert.doesNotMatch(fabricFragmentShader, /vec3\(0\.08, 0\.055, 0\.015\)/);
    assert.doesNotMatch(fabricFragmentShader, /directionalLight/);
    assert.match(
      fabricFragmentShader,
      /float neutralShade = clamp\(1\.0 - lift \* 0\.08 - rimShadow \* 0\.08, 0\.84, 1\.0\);/,
    );
    assert.match(fabricFragmentShader, /vec3 color = clothBase \* neutralShade;/);
  });
});
