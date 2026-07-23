# Cursor-Centered CTA Bump

## Goal

Keep the `07 · Get started` hover bump centered on the cursor at every horizontal position. It must not stretch toward the section center.

## Design

The mesh's perspective compensation will use the cursor position as its local origin. Each affected vertex will be adjusted relative to the cursor and then placed back around that same cursor position. This preserves a locally spherical bump near the left edge, center, and right edge.

The existing bump height, radius, rounded falloff, texture mapping, colors, and static fallback remain unchanged.

## Verification

- Add a regression test covering cursor positions on both sides of the section.
- Confirm each bump remains centered on its cursor without section-center bias.
- Run the focused tests, lint, production build, and browser hover verification.
