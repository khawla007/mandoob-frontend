# Knowledge Base Hero Design

## Objective

Give `/knowledge-base` a unique premium editorial background and bring its hero close to the home hero's visual height at equivalent viewports without removing, rewriting, reordering, or relocating any existing content or metrics.

## Baseline

Measured against the unchanged local `main` implementation:

| Viewport | Home hero | Knowledge Base hero | Difference |
| --- | ---: | ---: | ---: |
| 1280×720 | 758px | 990px | +232px |
| 768×1024 | 959px | 959px | 0px |
| 390×844 | 779px | 1109px | +330px |

The desktop and mobile excess comes from the shared hero's large vertical rhythm combined with the Knowledge Base metrics inside the hero. The tablet result already matches because both heroes resolve to the shared viewport-relative minimum height.

## Approved behavior

- Home continues using `/hero/skyline.jpg`; `/pro` continues using `/hero/pro-firm-operations.webp`. Neither page's markup or scoped styling changes.
- `/knowledge-base` receives `hero--knowledge-base`, its own generated WebP, and its own overlay.
- Every existing heading, paragraph, CTA, link, metric, section, data source, and order remains unchanged. The four metrics remain inside the hero.
- The hero uses natural content height. No fixed `height` or `max-height` may clip content.
- Desktop targets a Knowledge Base/home height delta of at most 24px at 1280×720. If the preserved metrics prevent exact equality, the smallest unclipped natural layout is accepted and documented.
- Tablet and mobile prioritize complete, readable natural flow with no overflow or overlap. All CTA targets remain at least 44px high.

## Visual design

The background is a refined Dubai research workspace rendered as photorealistic editorial commercial photography. Blank company-formation reference folders, document shapes, notebooks, and research materials sit in warm daylight with subtle, softly defocused UAE architectural context. Warm off-white, charcoal, muted sand, and tiny saffron-red accents align with Mandoob. The left side stays quiet and low-detail for copy, while meaningful visual detail is concentrated to the right and remains safe under responsive crops.

The page-specific overlay uses warm `--paper` color mixing so text remains readable in both themes. The overlay is stronger behind the left-side copy and fades toward the image detail. Mobile shifts the crop toward the right-side subject while preserving a quiet text field.

## Implementation

1. Generate one project-bound raster image with the structured prompt below, inspect it for constraints, crop/resize to 1915×821, and export a production WebP below 300KB when visually practical.
2. Add `hero--knowledge-base` and the existing decorative `hero__overlay` pattern to the Knowledge Base hero only.
3. Add modifier-scoped CSS for the asset, overlay, CTA colors, desktop/tablet/mobile spacing, heading scale, copy rhythm, divider, and metric grid.
4. Add a focused static regression contract before production code and prove RED then GREEN.
5. Measure computed layout and contrast in a browser at 1280×720, 768×1024, and 390×844 in light and dark themes. Verify home and `/pro` remain unchanged.

## Image-generation prompt

```text
Use case: photorealistic-natural
Asset type: responsive landing-page hero background for the Mandoob UAE company-setup Knowledge Base
Primary request: a premium editorial workspace representing trusted research and practical guidance for UAE company formation, licensing, free zones, visas, costs, documents, and compliance
Scene/backdrop: a refined contemporary Dubai office or research desk with neatly organized blank reference folders, linen notebooks, document shapes without readable information, and a softly defocused architectural skyline through glass
Style/medium: photorealistic editorial commercial photography, knowledgeable, calm, credible, and sophisticated rather than generic stock photography
Composition/framing: very wide landscape; quiet low-detail negative space across the left 55% behind hero copy; meaningful visual interest concentrated toward the right; safe responsive cropping at desktop, tablet, and mobile sizes; no important objects at extreme edges
Lighting/mood: soft warm daylight, clarity, authority, and confidence
Color palette: warm off-white, charcoal, muted sand, with very small saffron-red accents matching Mandoob
Materials/textures: matte paper, linen notebook covers, dark metal, warm stone, glass, and realistic surface detail
Constraints: no people; no readable text or personal information; no logos; no flags; no watermark; no dashboard screens; no neon; no blue corporate gradient
```

## Acceptance criteria

- `/knowledge-base` uses a dedicated background asset and modifier; home and `/pro` retain their current assets, markup, and scoped rules.
- All Knowledge Base hero copy, links, metrics, article data, and ordering are unchanged; metrics remain inside the hero.
- At 1280×720, the hero is within 24px of home unless the final browser measurement proves a smaller natural height would clip preserved content.
- At all three viewports there is no horizontal overflow, clipped or overlapping hero content, or CTA below 44px high.
- The four metrics remain visible and ordered: guides, topics, free zones, updates.
- Copy and both CTA states remain readable in light and dark themes; the primary CTA normal and hover text contrast meet WCAG AA for its actual text size.
- Focused tests, lint with zero errors, production build, and `git diff --check` complete; unrelated pre-existing failures are reported without scope expansion.
