# P1.11 English Public Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete cross-site English desktop content, metadata, theme, interaction, and accessibility polish on the exact accepted P1.10 frontend without changing accepted layouts or source/action boundaries.

**Architecture:** Keep all accepted page-family components and adapters. Add a small typed metadata policy and reusable route-error presentation, then make focused, test-first corrections to the carousel and Free Zone directory. Preserve all no-write and auth-security contracts and record later-phase debt in external evidence.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, next-intl, Swiper, Node test runner, Playwright/axe.

---

### Task 1: Freeze P1.11 contracts

**Files:**

- Create: `Reports/launch-gate-evidence/2026-09-08/public-frontend-phase-1/p1-11-english-public-polish/*.md`

- [x] Create the five required pre-code ledgers.
- [x] Record terminology, claim, state, CTA, metadata, theme, accessibility, and technical-exception policies.
- [x] Reconcile every route family to P1.12 and Phase 3–5 ownership.

### Task 2: Central metadata and global-state policy

**Files:**

- Create: `src/lib/public-metadata.ts`
- Create: `src/lib/public-metadata.test.ts`
- Create: `src/components/public-content/PublicRouteError.tsx`
- Create: `src/app/(public)/error.tsx`
- Create: `src/app/(auth)/error.tsx`
- Create: `src/app/robots.ts`
- Modify: `src/app/layout.tsx`
- Modify: applicable public/auth page metadata exports

- [x] Write failing tests for metadata base, unique homepage metadata, canonical URLs, auth/sensitive noindex, unavailable-state noindex, sitemap/robots policy, and safe error copy.
- [x] Run the focused tests and confirm failures describe missing policy.
- [x] Add the smallest typed helpers and route boundaries.
- [x] Run focused and affected metadata/security tests to green.

### Task 3: Manual carousel controls

**Files:**

- Modify: `src/components/site/home/homepage-content-contract.test.ts`
- Modify: `src/components/site/home/TestimonialsCarousel.tsx`
- Modify: `src/components/site/home/TestimonialsSection.tsx`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json` for key parity only
- Modify: `src/app/(public)/public-theme.css`

- [x] Change the existing contract test to require labelled previous/next/status controls and reject autoplay.
- [x] Run RED and confirm the accepted P1.10 autoplay implementation fails.
- [x] Implement keyboard-native manual controls, restrained status updates, and reduced-motion-safe behavior.
- [x] Run homepage, catalog, theme, and interaction tests to green.

### Task 4: Free Zone directory semantics and copy

**Files:**

- Modify: `src/components/site/company-setup/company-setup-pages.test.ts`
- Modify: `src/components/site/company-setup/FreeZoneDirectory.tsx`

- [x] Add failing coverage for search semantics, a named overflow region, caption, pluralization, applied-filter state, and explicit reset language.
- [x] Run RED.
- [x] Implement the minimal semantic/copy correction without changing filtering or layout.
- [x] Run company-setup and shared destination tests to green.

### Task 5: Integrated verification and evidence

**Files:**

- Complete: required P1.11 evidence and handoff documents
- Modify after verification: `docs/roadmap.md`, `Reports/daily-work-report.md`

- [x] Run changed-file formatting, focused and affected tests.
- [x] Run explicit full source inventory plus independent scanner.
- [x] Run TypeScript, lint, diff check, and production build.
- [x] Run English desktop light/dark browser checks, crawler, computed contrast, axe, console/network/privacy audit, and screenshot hashing.
- [x] Reconcile ledger and changed-file totals, commit final candidate, rerun final clean-state checks, then update roadmap/report without marking P1.12 or Phase 1 accepted.
