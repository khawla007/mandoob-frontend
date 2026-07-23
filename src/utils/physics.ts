export type FabricQuality = 'low' | 'medium' | 'high';

export type FabricParams = {
  stiffness: number;
  damping: number;
  sphereRadius: number;
  deformationStrength: number;
  recoverySpeed: number;
};

export type FabricState = {
  cols: number;
  rows: number;
  heights: Float32Array;
  velocities: Float32Array;
};

export type PointerState = {
  x: number;
  y: number;
  active: boolean;
};

export function qualityToGrid(quality: FabricQuality) {
  if (quality === 'high') return { cols: 88, rows: 44 };
  if (quality === 'medium') return { cols: 62, rows: 32 };
  return { cols: 38, rows: 20 };
}

export function createFabricState(quality: FabricQuality): FabricState {
  const { cols, rows } = qualityToGrid(quality);
  return {
    cols,
    rows,
    heights: new Float32Array(cols * rows),
    velocities: new Float32Array(cols * rows),
  };
}

export function stepFabric(
  state: FabricState,
  pointer: PointerState,
  params: FabricParams,
  dt: number,
) {
  const { cols, rows, heights, velocities } = state;
  const clampedDt = Math.min(dt, 1 / 30);
  const next = new Float32Array(heights.length);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const h = heights[i];

      const left = x > 0 ? heights[i - 1] : h;
      const right = x < cols - 1 ? heights[i + 1] : h;
      const up = y > 0 ? heights[i - cols] : h;
      const down = y < rows - 1 ? heights[i + cols] : h;
      const laplacian = left + right + up + down - h * 4;

      const u = x / (cols - 1);
      const v = y / (rows - 1);
      const dx = u - pointer.x;
      const dy = v - pointer.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = params.sphereRadius;
      const normalizedDistance = distance / radius;
      const spherePush =
        pointer.active && distance < radius
          ? 0.5 * (1 + Math.cos(Math.PI * normalizedDistance)) * params.deformationStrength
          : 0;

      const recovery = -h * params.recoverySpeed;
      const spring = laplacian * params.stiffness;
      const force = spring + recovery + spherePush;

      const velocity = (velocities[i] + force * clampedDt) * params.damping;
      velocities[i] = velocity;
      next[i] = h + velocity * clampedDt;
    }
  }

  heights.set(next);
}

export function estimateTension(state: FabricState, index: number) {
  const { cols, rows, heights } = state;
  const x = index % cols;
  const y = Math.floor(index / cols);
  const h = heights[index];
  const left = x > 0 ? heights[index - 1] : h;
  const right = x < cols - 1 ? heights[index + 1] : h;
  const up = y > 0 ? heights[index - cols] : h;
  const down = y < rows - 1 ? heights[index + cols] : h;
  return Math.abs(left - h) + Math.abs(right - h) + Math.abs(up - h) + Math.abs(down - h);
}
