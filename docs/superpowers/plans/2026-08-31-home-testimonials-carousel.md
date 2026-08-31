# Home Testimonials Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static three-card testimonial row with a localized, accessible, looping carousel containing 10 cards.

**Architecture:** Keep translation loading in the server-rendered `TestimonialsSection`, then pass a serializable testimonial array and localized control labels to a focused client carousel. The client component renders cloned boundary slides and controls the transform/index reset required for seamless looping.

**Tech Stack:** Next.js 16, React 19, TypeScript, next-intl, CSS, Node test runner

---

### Task 1: Lock the carousel contract with failing tests

**Files:**

- Modify: `src/components/site/home/homepage-content-contract.test.ts`
- Modify: `src/components/site/home/homepage-responsive-contract.test.ts`

- [ ] Add assertions that the server section defines 10 clients, renders `TestimonialsCarousel`, and loads localized previous/next/position labels.
- [ ] Add CSS assertions for a three/two/one-card responsive carousel and visible button controls at every breakpoint.
- [ ] Run `node --import tsx --conditions=react-server --test src/components/site/home/homepage-content-contract.test.ts src/components/site/home/homepage-responsive-contract.test.ts` and confirm failure because the carousel does not exist.

### Task 2: Implement the client carousel and localized content

**Files:**

- Create: `src/components/site/home/TestimonialsCarousel.tsx`
- Modify: `src/components/site/home/TestimonialsSection.tsx`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json`

- [ ] Define a serializable `Testimonial` interface and client component props for testimonials and localized accessibility labels.
- [ ] Render a transform track with boundary clones, `previous` and `next` buttons, keyboard handlers, pointer swipe handlers, looping transition reset, and a polite position announcement.
- [ ] Expand the server-side client list to 10 entries, map localized content into props, and render the client carousel.
- [ ] Add English and Arabic names, roles, quotes, carousel label, previous/next labels, and position text.
- [ ] Run the focused contract tests and confirm they pass.

### Task 3: Style and verify the responsive carousel

**Files:**

- Modify: `src/app/(public)/public-theme.css`

- [ ] Replace the static grid rules with an overflow-hidden viewport, moving flex track, three/two/one-card slide widths, interactive arrow states, touch-action support, and reduced-motion behavior.
- [ ] Run the focused tests, `npx tsc --noEmit`, `npm run lint`, and `npm run build`; resolve any new failures.
- [ ] Verify on `http://localhost:3001` that arrows, looping, keyboard navigation, swipe, responsive counts, and RTL behavior work without horizontal page overflow.
- [ ] Run `git diff --check`, review the scoped diff, and commit the completed carousel.
