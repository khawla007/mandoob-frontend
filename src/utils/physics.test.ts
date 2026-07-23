import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stepFabric, type FabricState } from './physics';

describe('fabric pointer deformation', () => {
  it('uses a rounded dome instead of a sharp center pin', () => {
    const state: FabricState = {
      cols: 5,
      rows: 5,
      heights: new Float32Array(25),
      velocities: new Float32Array(25),
    };

    stepFabric(
      state,
      { x: 0.5, y: 0.5, active: true },
      {
        stiffness: 0,
        damping: 1,
        sphereRadius: 0.5,
        deformationStrength: 1,
        recoverySpeed: 0,
      },
      1 / 30,
    );

    const centerHeight = state.heights[12];
    const adjacentHeight = state.heights[13];

    assert.ok(adjacentHeight / centerHeight > 0.45);
  });

  it('projects a visible deformation symmetrically around the cursor', async () => {
    const physics = await import('./physics');
    const getCursorCenteredFabricPosition = Reflect.get(
      physics,
      'getCursorCenteredFabricPosition',
    );

    assert.equal(typeof getCursorCenteredFabricPosition, 'function');
    if (typeof getCursorCenteredFabricPosition !== 'function') return;

    const cameraDistance = 6;
    const height = 1.2;
    const pointer = { x: 0.2, y: 0.5, active: true };
    const viewportWidth = 10;
    const viewportHeight = 4;
    const pointerX = (pointer.x - 0.5) * viewportWidth;
    const projectX = (worldX: number) => worldX * (cameraDistance / (cameraDistance - height));

    const left = getCursorCenteredFabricPosition({
      baseX: pointerX - 0.4,
      baseY: 0,
      height,
      pointer,
      viewportWidth,
      viewportHeight,
      cameraDistance,
    });
    const right = getCursorCenteredFabricPosition({
      baseX: pointerX + 0.4,
      baseY: 0,
      height,
      pointer,
      viewportWidth,
      viewportHeight,
      cameraDistance,
    });

    const projectedLeft = projectX(left.x);
    const projectedRight = projectX(right.x);
    const leftDistance = pointerX - projectedLeft;
    const rightDistance = projectedRight - pointerX;

    assert.ok(leftDistance > 0.4);
    assert.ok(Math.abs(leftDistance - rightDistance) < 1e-6);
    assert.ok(Math.abs((projectedLeft + projectedRight) / 2 - pointerX) < 1e-6);
  });
});
