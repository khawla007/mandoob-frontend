# Home Testimonials Swiper Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mandoob's custom testimonial carousel with the exact Swiper-based continuous carousel behavior used by Weelp.

**Architecture:** `TestimonialsSection` remains a server component that supplies 10 localized testimonial records. `TestimonialsCarousel` remains the client boundary but delegates looping, autoplay, breakpoints, dragging, and transition behavior to Swiper's React components and Autoplay module.

**Tech Stack:** Next.js 16, React 19, TypeScript, next-intl, Swiper 12.1.2, CSS, Node test runner

---

### Task 1: Lock Weelp parity with a failing contract test

**Files:**

- Modify: `src/components/site/home/homepage-content-contract.test.ts`

- [ ] Replace the custom-carousel assertions with checks for imports from `swiper/react` and `swiper/modules`, `delay: 0`, `speed={reducedMotion ? 0 : 8000}`, `disableOnInteraction: true`, `pauseOnMouseEnter: true`, responsive 1/2/3/4 slide breakpoints, and looping.
- [ ] Assert the old custom pointer, transition, cloned-slide, and arrow implementation is absent.
- [ ] Run `node --import tsx --conditions=react-server --test src/components/site/home/homepage-content-contract.test.ts` and confirm failure because the custom carousel is still present.

### Task 2: Install Swiper and replace the custom carousel

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/site/home/TestimonialsCarousel.tsx`

- [ ] Run `npm install swiper@12.1.2` so package metadata and the lockfile remain synchronized.
- [ ] Replace custom transform state and pointer logic with `Swiper`, `SwiperSlide`, and `Autoplay`.
- [ ] Match Weelp's exact autoplay, speed, loop, spacing, and responsive settings.
- [ ] Retain Mandoob's translated card content, image rendering, RTL card direction, and reduced-motion listener.
- [ ] Run the focused contract test and confirm it passes.

### Task 3: Replace custom carousel CSS and verify

**Files:**

- Modify: `src/app/(public)/public-theme.css`
- Modify: `src/components/site/home/homepage-responsive-contract.test.ts`

- [ ] Import Swiper base CSS from the client component and replace the custom viewport/track/slide/arrow rules with scoped Swiper equal-height and card-spacing rules.
- [ ] Update responsive contracts to assert Swiper breakpoints live in the component and custom arrow rules are absent.
- [ ] Run focused homepage tests, localization tests, `npx tsc --noEmit`, `npm run lint`, formatting checks, and the production build.
- [ ] Verify continuous autoplay, hover pause, drag/swipe, responsive counts, reduced motion, RTL content, and zero page overflow on `http://localhost:3001`.
- [ ] Review `git diff --check` and commit the parity implementation.
