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
});
