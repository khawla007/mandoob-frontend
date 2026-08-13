# Action Deck Glass Shine Design

## Scope

Replace the Action Deck cards' upward hover translation with a single broad glass-reflection sweep. Do not change card dimensions, content, links, colors, patterns, spacing, or data behavior.

## Interaction

- Pointer hover-in runs one left-to-right glass pass.
- Pointer hover-out runs one right-to-left pass.
- The card remains stationary throughout; no translate, scale, bounce, or lift is allowed.
- Keyboard focus uses the same glass-visible state without moving the card.
- The reflection does not loop while hovered.

## Visual treatment

- Use the approved broad-glass option: a wide transparent white band with a bright specular center and soft transparent edges.
- Do not add orange edges, dark shadows, glow trails, or a shadow-like line.
- Clip the effect inside the existing rounded card.
- Keep card content and the existing bottom-right pattern above or below the shine as needed for legibility, without changing their appearance.

## Motion

- Duration: 700ms.
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Animate only a compositor-friendly transform on a pseudo-element.
- Under `prefers-reduced-motion: reduce`, disable the sweep and keep the card stationary.

## Verification

- Structural tests assert that Action Deck cards no longer use hover translation.
- Structural tests assert the broad glass pseudo-element, forward hover state, reverse hover-out state, 700ms timing, easing, and reduced-motion override.
- TypeScript, formatting, diff checks, and focused dashboard tests must pass.
- Authenticated browser verification should confirm one forward pass on hover-in and one reverse pass on hover-out.
