import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fabricFragmentShader } from './fabric';

describe('fabric fragment shader', () => {
  it('keeps bump shading neutral without warm yellow tint colors', () => {
    assert.doesNotMatch(fabricFragmentShader, /lineHighlight/);
    assert.doesNotMatch(fabricFragmentShader, /vec3\(0\.08, 0\.055, 0\.015\)/);
    assert.match(fabricFragmentShader, /vec3 color = clothBase \* neutralShade;/);
  });
});
