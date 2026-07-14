# PRO Hero Responsive Design

## Objective

Give `/pro` a category-specific hero background and prevent its longer copy from making the hero visibly taller than the home-page hero at equivalent breakpoints. Preserve every existing heading, paragraph, CTA, statistic, section, and route.

## Approved behavior

- Home continues using `/hero/skyline.jpg` with no visual or structural changes.
- `/pro` receives its own `hero--pro` modifier and a new optimized WebP background.
- The PRO hero follows the same responsive height system as home. Its longer copy is accommodated by PRO-only spacing and typography rules, not by removing or relocating content.
- The statistics band stays immediately after the hero and is not folded into it.
- Mobile content remains readable and unclipped: buttons retain 44px touch targets, copy wraps naturally, and compact spacing applies below 768px.

## Visual direction

The background depicts an editorial, premium UAE PRO-firm operations environment: organized visa/compliance documents and a modern workspace, with a restrained Dubai/UAE context. It uses warm monochrome neutrals and a small saffron-red accent that matches Mandoob. The left side remains quiet for copy; detail concentrates toward the right. No people, readable personal data, text, logos, flags, watermarks, or dashboard UI are embedded in the image.

## Implementation

1. Generate one wide, project-bound raster source using the refined image prompt below.
2. Crop/resize it to the established hero aspect ratio and export `public/hero/pro-firm-operations.webp` with a practical web file size.
3. Add `hero--pro` to `ProHeroSection` only.
4. Add scoped CSS for the unique image, overlay, and responsive spacing. Use the shared `.hero` rules as the baseline and avoid fixed pixel heights that could clip localized or zoomed text.
5. Add a regression test that proves the PRO modifier, dedicated asset reference, desktop compaction, and mobile compaction remain present.

## Refined image-generation prompt

```text
Use case: photorealistic-natural
Asset type: responsive landing-page hero background for Mandoob's UAE PRO-firm software page
Primary request: a premium editorial still life representing organized UAE visa, Emirates ID, licensing, renewal, and client-document operations in a modern professional-services workspace
Scene/backdrop: refined contemporary Dubai office desk with carefully arranged blank document folders, passport-sized document shapes without readable data, a subtle architectural skyline visible through softly defocused glass
Style/medium: photorealistic editorial commercial photography, sophisticated and credible rather than generic stock photography
Composition/framing: very wide landscape; quiet low-detail negative space across the left 55% for headline and buttons; visual interest concentrated on the right; background-safe crop at desktop and mobile widths
Lighting/mood: soft warm daylight, calm operational confidence, restrained contrast
Color palette: warm off-white, charcoal, muted sand, very small saffron-red accents matching Mandoob
Materials/textures: matte paper, dark metal, warm stone, subtle glass reflections, realistic surface detail
Constraints: no people; no readable personal information; no readable text; no logos; no flags; no watermark; no dashboard screens; no neon; no blue corporate gradient; do not place important objects at the extreme edges
```

## Acceptance criteria

- `/pro` no longer uses the home skyline asset.
- All existing PRO content and stats are unchanged and retain their order.
- At the same desktop viewport, the PRO hero is within a small visual tolerance of the home hero and no longer has the previous excess height.
- At 390px and 768px widths, there is no horizontal overflow, clipped copy, overlapping controls, or undersized touch target.
- The image remains legible behind both light and dark overlays and does not reduce text contrast.
- Focused regression test, lint, and production build pass; the unrelated missing load-test fixture is reported separately if the full suite still encounters it.
