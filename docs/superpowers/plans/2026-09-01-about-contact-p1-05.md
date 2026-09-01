# P1.05 About and Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the English desktop `/about` and `/contact` bodies to the approved references, with claim-safe content and a complete accessible no-write contact state contract.

**Architecture:** Keep both route pages as Server Components with static metadata and page-specific server-rendered compositions. Share only the scenic hero, information strip, compact feature item, and conversion band; isolate contact interactivity in one Client Component backed by pure normalization/validation and an injected typed adapter whose default result is honestly unavailable.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, next/image, next/link, lucide-react, Node test runner, happy-dom, Playwright, axe-core.

---

### Task 1: Lock routes, metadata, order, links, and content safety

**Files:**

- Create: `src/components/site/about-contact-pages.test.ts`
- Modify: `src/app/(public)/about/page.tsx`
- Modify: `src/app/(public)/contact/page.tsx`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/sitemap.test.ts`

- [ ] Add source-contract tests for one `h1`, static metadata/canonicals, accepted shell ownership, `/estimate` and `/contact` CTAs, sitemap entries, and rejection of `320+`, `45+`, `AED 2.4M`, `98%`, response/timing/fine/guarantee claims, sample contact values, and hash links. Tasks 4 and 6 own the exact section-order and quick-link contracts once their page-body components exist.
- [ ] Run the new tests and record the expected RED failures against the generic About and disabled Contact pages.
- [ ] Add temporary safe server route shells with one `h1`, real `/estimate` and `/contact` links, static metadata, and `/about` plus `/contact` sitemap paths; Tasks 4 and 6 replace the temporary bodies.
- [ ] Re-run the focused tests to GREEN and commit.

### Task 2: Define and prove contact contracts

**Files:**

- Create: `src/lib/public-contact/contracts.ts`
- Create: `src/lib/public-contact/validation.ts`
- Create: `src/lib/public-contact/validation.test.ts`
- Create: `src/lib/public-contact/demo-adapter.ts`
- Create: `src/lib/public-contact/demo-adapter.test.ts`

- [ ] Write failing tests for whitespace normalization, Unicode-safe explicit limits, required fields, email syntax, UAE `+971` mobile/landline shape, allowed subjects, consent, normalized payloads, all result discriminants, deterministic demo outcomes, and zero use of fetch/server actions/Supabase/messaging providers.
- [ ] Run and verify RED because the modules do not exist.
- [ ] Define `ContactSubject`, raw/normalized payloads, field-error/result unions, `ContactAdapter`, constants, and a pure `validateContactSubmission` returning either normalized data or linked field errors.
- [ ] Implement a clearly labelled synthetic adapter factory for test/local injection and an exported production adapter returning `unavailable`; neither may perform I/O.
- [ ] Re-run tests to GREEN and commit.

### Task 3: Build strict-parity shared primitives and scoped styling

**Files:**

- Create: `src/components/site/about-contact/PageScenicHero.tsx`
- Create: `src/components/site/about-contact/CompactFeature.tsx`
- Create: `src/components/site/about-contact/RaisedInfoStrip.tsx`
- Create: `src/components/site/about-contact/PublicConversionBand.tsx`
- Create: `src/components/site/about-contact/about-contact-primitives.test.ts`
- Modify: `src/app/(public)/public-theme.css`

- [ ] Write failing semantic/style contracts for breadcrumb ownership, `next/image` with `sizes`, semantic lists, five-column raised panels, logical properties, light/dark tokens, 1440/1280 desktop grids, focus-visible styling, and reduced motion.
- [ ] Run and verify RED.
- [ ] Implement narrow server-rendered primitives with serializable props and no generic page-builder abstraction.
- [ ] Add `.about-contact-*` scoped CSS reproducing the reference depth, borders, icon medallions, density, and dark equivalent while preserving existing smaller-screen rules.
- [ ] Re-run tests to GREEN and commit.

### Task 4: Implement the exact About composition

**Files:**

- Create: `src/components/site/about/AboutPageBody.tsx`
- Create: `src/components/site/about/about-page.test.ts`
- Modify: `src/app/(public)/about/page.tsx`
- Modify: `src/app/(public)/public-theme.css`

- [ ] Write a failing contract for: scenic hero; five-item capability panel; Who We Are image/copy/Mission-Vision arrangement; four values; connected five-step process; four equal team-function cards; conversion band.
- [ ] Assert local project imagery, descriptive alt text, real `/estimate` and `/contact` links, safe one-company/one-PRO copy, and no people/testimonials/metrics/guarantees.
- [ ] Run and verify RED.
- [ ] Implement the seven-part server composition using `hero/skyline.webp` and `hero/pro-firm-operations.webp`, safe platform invariants, and Product/UAE Operations/Customer Support/Compliance Coordination cards.
- [ ] Re-run to GREEN, type-check, inspect the rendered 1440 light page, and commit.

### Task 5: Implement Contact form behavior and complete state UI

**Files:**

- Create: `src/components/contact/ContactForm.tsx`
- Create: `src/components/contact/contact-form.test.tsx`
- Modify: `src/app/(public)/public-theme.css`

- [ ] Write a happy-dom client test harness that mounts the real form and verifies labels, field-grid controls, error-summary anchors/focus, consent links, invalid fields, pending announcement and duplicate-submit prevention, success/duplicate/rate/failure/unavailable messages, retry, reset, and focus restoration.
- [ ] Run and verify RED.
- [ ] Implement the smallest Client Component using controlled state, `FormData`, `validateContactSubmission`, an optional serializable demo mode/result selector for local evidence, and the production unavailable adapter by default.
- [ ] Ensure every status explicitly states whether a message was sent; synthetic success must say no message was sent.
- [ ] Re-run to GREEN and commit.

### Task 6: Implement the exact Contact composition

**Files:**

- Create: `src/components/site/contact/ContactPageBody.tsx`
- Create: `src/components/site/contact/contact-page.test.ts`
- Modify: `src/app/(public)/contact/page.tsx`
- Modify: `src/app/(public)/public-theme.css`

- [ ] Write a failing contract for: scenic hero with four capabilities; five-channel panel in office/phone/email/WhatsApp/hours order; form/help workspace; WhatsApp/Quick Links row; conversion band.
- [ ] Assert every unverified channel is visibly unavailable, supported help categories use qualified banking language, and quick links are limited to working routes.
- [ ] Run and verify RED.
- [ ] Implement the five-part composition, keeping channel slots without fabricated destinations and using only `/estimate`, `/mainland`, `/free-zones`, `/offshore`, `/knowledge-base`, and `/apply` where semantically valid.
- [ ] Re-run to GREEN, type-check, inspect the rendered 1440 light page, and commit.

### Task 7: Correct desktop parity, themes, and accessibility

**Files:**

- Modify: `src/app/(public)/public-theme.css`
- Modify only P1.05 components/tests as required

- [ ] Run the app on a free loopback port without stopping other tasks.
- [ ] Capture `/about` and `/contact` at 1440×900 light and compare section-by-section with `About us.png` and `Contact us.png`; correct geometry, density, image balance, and CTA position.
- [ ] Repeat at 1440×900 dark and smoke 1280×800 in both themes; confirm no page-level overflow.
- [ ] Keyboard-test shell, headings, form labels, summary anchors, consent, pending/disabled, retry/reset, and focus visibility.
- [ ] Demonstrate invalid/pending/success/duplicate/rate/failure with the synthetic no-write evidence mode; verify no non-loopback requests or console/hydration/asset errors.
- [ ] Run focused axe WCAG 2 A/AA and 2.1 A/AA; correct all new Critical/Serious issues.

### Task 8: Verify, document, and close P1.05

**Files:**

- Create: `../../../Reports/launch-gate-evidence/2026-09-01/public-frontend-phase-1/p1-05-about-contact/verification.md`
- Create: `../../../Reports/launch-gate-evidence/2026-09-01/public-frontend-phase-1/p1-05-about-contact/parity-matrix.md`
- Create: `../../../Reports/launch-gate-evidence/2026-09-01/public-frontend-phase-1/p1-05-about-contact/content-safety-substitutions.md`
- Create: `../../../Reports/launch-gate-evidence/2026-09-01/public-frontend-phase-1/p1-05-about-contact/data-source-map.md`
- Create screenshots and `sha256sums.txt` in the same evidence directory
- Modify: `../../../docs/roadmap.md`
- Modify: `../../../Reports/daily-work-report.md`

- [ ] Resolve and inspect all focused/affected tests, then run them with the prompt command.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `git diff --check`, and `npm run build`; fix only P1.05 regressions.
- [ ] Write sanitized evidence and hashes, recording base/dependency/final SHA, test totals, browser matrix, no-write proof, substitutions, channel map, and Phase 3/4/5 debt.
- [ ] Commit the verified implementation, update the final SHA in evidence, mark P1.05 complete in the roadmap, update the remaining Phase 1 estimate using actual elapsed time, append the daily report, and commit documentation.
- [ ] Confirm the final worktree is clean and stop without merge, push, deployment, P1.06, Arabic/RTL completion, responsive redesign, dashboard, API, or database work.
