import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fabricFragmentShader } from './fabric';

describe('fabric fragment shader', () => {
  it('uses only the original pattern colors without bump tint or shadow', () => {
    assert.doesNotMatch(fabricFragmentShader, /lineHighlight/);
    assert.doesNotMatch(fabricFragmentShader, /vec3\(0\.08, 0\.055, 0\.015\)/);
    assert.doesNotMatch(fabricFragmentShader, /directionalLight/);
    assert.doesNotMatch(fabricFragmentShader, /neutralShade|rimShadow/);
    assert.match(
      fabricFragmentShader,
      /vec2 repeatedUv = vec2\(\(vUv\.x - 0\.5\) \* uTextureRepeat\.x \+ 0\.5, 1\.0 - vUv\.y\);/,
    );
    assert.match(fabricFragmentShader, /vec3 color = tex\.rgb;/);
  });
});
