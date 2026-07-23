import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const componentSource = readFileSync(new URL('./FabricBackground.tsx', import.meta.url), 'utf8');

describe('FabricBackground mesh deformation', () => {
  it('keeps pattern displacement centered without a lateral pull', () => {
    assert.doesNotMatch(componentSource, /lateralFalloff/);
    assert.match(
      componentSource,
      /position\.setXYZ\(\s*i,\s*basePositions\[i \* 3\],\s*basePositions\[i \* 3 \+ 1\],\s*state\.heights\[i\] \* 0\.95,\s*\)/,
    );
  });
});
