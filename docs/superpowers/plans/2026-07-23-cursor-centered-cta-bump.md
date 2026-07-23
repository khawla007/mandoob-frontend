# Cursor-Centered CTA Bump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the section-center bias so the CTA hover bump stays centered on the cursor near both edges.

**Architecture:** Keep the existing height simulation and perspective compensation. Remove only the extra horizontal inward scale that pulls raised vertices toward the section origin.

**Tech Stack:** React, TypeScript, Three.js, Node test runner, Next.js

---

### Task 1: Remove section-center bias

**Files:**
- Modify: `src/components/FabricBackground.test.ts`
- Modify: `src/components/FabricBackground.tsx:141-154`

- [ ] **Step 1: Write the failing regression test**

Replace the first test in `src/components/FabricBackground.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/FabricBackground.test.ts
```

Expected: one failure because `inwardScale` still exists and the X coordinate uses `perspectiveScale - inwardScale`.

- [ ] **Step 3: Apply the minimal implementation**

In the mesh update loop, remove `inwardScale` and use the same perspective compensation for both axes:

```ts
const height = Math.max(state.heights[i] * 0.95, 0);
const perspectiveScale = Math.max(
  0.05,
  (CAMERA_DISTANCE - height) / CAMERA_DISTANCE,
);

position.setXYZ(
  i,
  basePositions[i * 3] * perspectiveScale,
  basePositions[i * 3 + 1] * perspectiveScale,
  height,
);
```

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/FabricBackground.test.ts
npm test
npm run lint
npm run build
git diff --check
```

Expected: all tests pass; lint and build exit successfully; `git diff --check` prints nothing.

- [ ] **Step 5: Verify the original visual behavior**

Run the homepage locally and hover near the left edge, center, and right edge of `07 · Get started`.

Expected: each small spherical bump remains centered on its cursor position, with no inward pull. Pattern scale, colors, and fallback behavior remain unchanged.

- [ ] **Step 6: Commit and push directly to main**

```bash
git add src/components/FabricBackground.test.ts src/components/FabricBackground.tsx docs/superpowers/plans/2026-07-23-cursor-centered-cta-bump.md
git commit -m "fix: center CTA bump on cursor"
git push origin main
```
