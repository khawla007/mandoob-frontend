# P1.07 Public Knowledge and Editorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver manager-demo-ready English desktop Knowledge Base, Blog, Legal, and generic CMS public presentation from accepted P1.06 without changing backend contracts or performing remote writes.

**Architecture:** Keep the static reviewed Knowledge Base catalog and accepted published-only Blog/CMS loaders. Add one discriminated public read-state contract, route-level resolver adapters that preserve missing versus unavailable, focused interactive client islands for Knowledge Base discovery and the no-write newsletter, and shared server-rendered editorial/state components. Keep metadata, JSON-LD, sanitization, and sitemap logic server-side and testable through injected loaders.

**Tech Stack:** Next.js 16.2 App Router, React 19 Server/Client Components, TypeScript, `node:test`, `sanitize-html`, CSS in `public-theme.css`, agent-browser/axe for desktop acceptance.

---

### Task 1: Freeze inventory and state contracts

**Files:**

- Create: `src/lib/public-content/read-state.ts`
- Create: `src/lib/public-content/read-state.test.ts`
- Create: `src/lib/public-content/json-ld.ts`
- Create: `src/lib/public-content/json-ld.test.ts`

- [ ] Write tests proving `loading`, `ready`, `empty`, `no-results`, `unavailable`, and `missing` are exclusive discriminants and that loader failures retain only a sanitized public message.
- [ ] Run the focused test and confirm failure because the modules do not exist.
- [ ] Implement `PublicReadState<T>` plus narrow constructors/resolvers; never put an `Error` or provider text in the public value.
- [ ] Add `serializeJsonLd(value)` using `JSON.stringify(value).replace(/</g, '\\u003c')` and tests for script-breakout input.
- [ ] Re-run focused tests to green.

### Task 2: Build Knowledge Base discovery and no-write newsletter

**Files:**

- Create: `src/lib/knowledge-base/discovery.ts`
- Create: `src/lib/knowledge-base/discovery.test.ts`
- Create: `src/components/knowledge-base/KnowledgeBaseExplorer.tsx`
- Create: `src/components/knowledge-base/KnowledgeBaseNewsletter.tsx`
- Create: `src/components/knowledge-base/KnowledgeBaseNewsletter.test.ts`
- Modify: `src/app/(public)/knowledge-base/page.tsx`
- Modify: `src/app/(public)/knowledge-base/KnowledgeBaseHero.test.ts`
- Modify: `src/app/(public)/public-theme.css`

- [ ] Write failing tests for case/whitespace normalization, title/description/keyword/category matching, URL-restored query/category, popular-query selection, reset, derived counts, empty/no-results distinction, deterministic first-four featured guides, FAQ disclosures, support destinations, and production no-write newsletter isolation.
- [ ] Confirm failures describe missing P1.07 behavior.
- [ ] Implement pure discovery functions and a query-synchronized client explorer using one `q` and optional `category` search parameter.
- [ ] Rebuild `/knowledge-base` in exact order: hero/search/chips; six primary category cards plus View all; four Start here guides; FAQ/support rail; no-write newsletter; four-item information strip; shared footer transition supplied by the layout.
- [ ] Use reviewed local assets, native `<details>`, `/contact`, `/estimate`, and explicit unavailable WhatsApp/newsletter delivery copy.
- [ ] Re-run focused tests and verify the ready/no-results interactions at both desktop widths/themes.

### Task 3: Complete Knowledge Base article presentation

**Files:**

- Create: `src/app/(public)/knowledge-base/[slug]/page.test.ts`
- Modify: `src/app/(public)/knowledge-base/[slug]/page.tsx`
- Modify: `src/lib/knowledge-base/index.ts`
- Modify: `src/lib/knowledge-base/index.test.ts`
- Modify: `src/app/(public)/public-theme.css`

- [ ] Write failing tests for breadcrumb, one h1, deterministic anchored table of contents, reviewed metadata, related guides, indicative estimator handoff, true missing state, and exactly one safely serialized Article/FAQ JSON-LD payload.
- [ ] Confirm the JSON-LD test fails on raw `<` serialization.
- [ ] Implement the editorial hero/prose/support rail and shared safe JSON-LD serializer; qualify variable cost, time, approval, tax, ownership, immigration, and compliance language in reviewed static copy.
- [ ] Re-run article/catalog tests to green.

### Task 4: Model Blog index/detail states and pagination

**Files:**

- Create: `src/lib/blog/public-presentation.ts`
- Create: `src/lib/blog/public-presentation.test.ts`
- Create: `src/components/blog/PublicBlogIndex.tsx`
- Create: `src/components/blog/PublicBlogSearch.tsx`
- Create: `src/components/public-content/PublicContentState.tsx`
- Create: `src/app/(public)/blog/page.test.ts`
- Create: `src/app/(public)/blog/[slug]/page.test.ts`
- Modify: `src/app/(public)/blog/page.tsx`
- Modify: `src/app/(public)/blog/[slug]/page.tsx`
- Modify: `src/lib/blog/render.ts`
- Modify: `src/lib/data/blog.test.ts`
- Modify: `src/app/(public)/public-theme.css`

- [ ] Write loader-injected failing tests for index ready/empty/no-results/unavailable and detail ready/missing/unavailable/malformed.
- [ ] Write failing pagination tests for absent, invalid, zero, negative, decimal, nonnumeric, and excessive pages; boundaries must render non-anchor disabled text and stable canonical links.
- [ ] Write sanitization tests covering headings, lists, safe/unsafe links, quotes, code, tables, images, captions, long URLs, and external `target`/`rel` policy.
- [ ] Implement strict integer parsing, clamped deterministic pagination, loaded-post search, a featured/latest region, dense grid, local cover fallbacks, and sanitized in-shell unavailable recovery.
- [ ] Implement Blog Article JSON-LD from accepted fields only and serialize it safely once.
- [ ] Re-run Blog tests to green.

### Task 5: Preserve Legal/CMS visibility while adding resilience

**Files:**

- Create: `src/lib/pages/public-presentation.ts`
- Create: `src/lib/pages/public-presentation.test.ts`
- Create: `src/app/(public)/legal/[slug]/page.test.ts`
- Modify: `src/app/(public)/legal/[slug]/page.tsx`
- Modify: `src/app/(public)/[slug]/page.tsx`
- Modify: `src/app/(public)/[slug]/page.test.ts`
- Modify: `src/components/pages/PublicCmsPage.tsx`
- Modify: `src/components/pages/PublicCmsPage.test.ts`
- Modify: `src/app/(public)/public-theme.css`

- [ ] Reproduce the transient loader defect with injected throwing loaders before production changes.
- [ ] Test legal allowlist, reserved generic slugs, published/scheduled/archived/deleted visibility, malformed rows, ready/missing/unavailable distinctions, noindex/canonical, safe hero URLs/contrast, and omission of script slots.
- [ ] Implement resolver results that map only a successful null/publicly invisible record to `missing`; map thrown reads to sanitized `unavailable` rendered inside the shared shell with real navigation/retry link.
- [ ] Constrain hero backgrounds/actions to validated safe values, demote CMS body h1 elements, sanitize body/schema, and keep `scriptHead`, `scriptBodyStart`, and `scriptBodyEnd` unused.
- [ ] Re-run Legal/CMS tests to green.

### Task 6: Add route loading/error presentation and integration regressions

**Files:**

- Create: `src/app/(public)/knowledge-base/loading.tsx`
- Create: `src/app/(public)/blog/loading.tsx`
- Create: `src/app/(public)/blog/[slug]/loading.tsx`
- Create: `src/app/(public)/legal/[slug]/loading.tsx`
- Create: `src/app/(public)/[slug]/loading.tsx`
- Modify: `src/app/sitemap.test.ts`
- Modify: `src/components/site/public-navigation.test.ts`

- [ ] Write source/render tests for meaningful `role=status`, one logical h1, one main from the public layout, final-geometry skeletons, destinations, metadata, sitemap, and JSON-LD uniqueness.
- [ ] Implement the smallest shared loading geometry and preserve true `notFound()` only for `missing`.
- [ ] Run every affected public/editorial test to green.

### Task 7: Run engineering and content-safety gates

- [ ] Run focused P1.07 tests with `node --import tsx --conditions=react-server --test ...`.
- [ ] Run the complete affected public/editorial set.
- [ ] Run `npm test`; preserve literal-glob/aggregate scanner truth and independently rerun the exact failing scanner when needed.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `git diff --check`, and `npm run build`.
- [ ] Run forbidden-copy/source scans for legacy Client, multi-company, invented contacts/claims, unsafe CMS scripts, newsletter mutation, and new remote writes.

### Task 8: Browser acceptance and evidence

**Files:**

- Create/update all required files under `../../../Reports/launch-gate-evidence/2026-09-05/public-frontend-phase-1/p1-07-knowledge-blog-legal-cms/`
- Modify only after all gates pass: `../../../docs/roadmap.md`
- Modify only after all gates pass: `../../../Reports/daily-work-report.md`

- [ ] Start a production runtime on an unused loopback port using safe local fixture injection that is unreachable in production.
- [ ] Use the visible supported browser workflow and supplemental agent-browser after loading its current core skill.
- [ ] Capture required 1440x900 and 1280x800 light/dark ready/state routes; verify keyboard, focus, reduced motion, axe, console/hydration, JSON-LD client navigation, overflow, links/images, and zero newsletter mutations.
- [ ] Write verification, parity/state/claim/metadata matrices, changed inventory, browser acceptance, sanitized screenshots, and SHA-256 sums.
- [ ] If every gate passes, update only P1.07 and the current daily report; otherwise keep P1.07 in progress and name exact blockers.
- [ ] Commit the verified P1.07 application/evidence references locally. Do not merge, push, or deploy.
