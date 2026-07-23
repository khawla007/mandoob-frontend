# Compact Final CTA Bump

## Goal

Make the cursor-driven fabric bump in the homepage `07 · Get started` section feel compact and restrained instead of broad and stretchy.

## Root Cause

`FabricBackground` currently uses a normalized interaction radius of `0.25` and deformation strength of `172`. The lateral displacement also follows the raised fabric beyond the direct interaction radius, so the visible pull covers a large portion of the CTA.

## Design

Keep the shared fabric simulation unchanged and pass homepage-specific parameter overrides from `FinalCtaSection`:

- Reduce `sphereRadius` from `0.25` to `0.13`.
- Reduce `deformationStrength` from `172` to `105`.
- Preserve stiffness, damping, recovery speed, lighting, texture, and pointer tracking.

The smaller radius confines the interaction near the cursor. The lower strength reduces both the vertical lift and its derived lateral displacement. Passing overrides at the call site prevents unintended changes to other current or future `FabricBackground` consumers.

## Scope

Only the homepage `FinalCtaSection` changes. The shared physics engine, shader, texture, static fallback, reduced-motion behavior, CTA copy, and CTA layout remain unchanged.

## Verification

- Add a source-level regression assertion that the homepage passes `sphereRadius: 0.13` and `deformationStrength: 105`.
- Run the focused `FinalCtaSection` test.
- Run the project lint command.
- Run a production build to catch TypeScript and integration errors.
- Visually verify that the bump remains centered on the cursor, affects a compact area, and recovers normally.
