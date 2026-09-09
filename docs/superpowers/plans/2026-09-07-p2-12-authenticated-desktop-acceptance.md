# P2.12 Authenticated Desktop Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the exact P2.11 candidate across 108 authenticated English desktop routes using a disposable loopback-only four-role fixture, strict Playwright acceptance, retained sanitized evidence, and verified teardown.

**Architecture:** A test-only fixture module owns local-target validation, deterministic synthetic data, runtime secret handling, setup/invariant checks, and teardown. A dedicated Playwright configuration acquires sessions through the real login/MFA UI, resolves route aliases from an ignored manifest, runs strict all-route and representative interaction suites, and emits machine-readable reconciliation that evidence tooling converts to sanitized ledgers and hashes. Application changes are allowed only for test-proven acceptance defects.

**Tech Stack:** Next.js 16.2.12, React 19.2.4, TypeScript, Supabase JS 2.104.1/local CLI/PostgreSQL, Playwright 1.60.0, axe-core 4.11.3, node:test.

---

### Task 1: Dedicated local stack and fail-closed guard

**Files:** modify `supabase/config.toml`; create `scripts/p2-acceptance/local-target.ts`; test `scripts/p2-acceptance/local-target.test.ts`.

- [x] Write tests that reject missing opt-in/env, remote/API/DB/storage hosts, ambiguous/non-running projects, non-loopback DNS results, mismatched status endpoints, and non-fixture identities; accept only exact loopback candidate status.
- [x] Run the focused test and confirm RED because the guard module is absent.
- [x] Implement URL parsing, DNS loopback checks, redacted status parsing, project identity, and disposable-content preflight without logging secrets.
- [x] Enable local TOTP and collision-free candidate-only ports/project id in `supabase/config.toml`.
- [x] Run focused tests GREEN and start/reset only the candidate local stack.

### Task 2: Fixture setup, invariants, and teardown

**Files:** create `scripts/p2-acceptance/fixture.ts`, `scripts/p2-acceptance/totp.ts`, `scripts/p2-acceptance/fixture.test.ts`; replace unsupported behavior in `scripts/seed-auth.ts` with a refusal directing P2.12 callers to the guarded tool; extend `.gitignore` for every generated secret/session/trace/manifest artifact.

- [x] Write RED tests for exactly four roles, one tenant/Company/PRO assignment, tenantless Admin+PRO semantics, deterministic business aliases, crypto-generated secrets, owner-only files, idempotence, cleanup, and forbidden logging.
- [x] Implement guarded setup against current tables/workflows and bounded fixture-owned rows; do not change migrations.
- [x] Implement invariant verification and exact fixture cleanup/reset.
- [x] Prove setup twice without accumulation, teardown, clean reseed, and final teardown.

### Task 3: Strict real login/MFA state acquisition

**Files:** modify `tests/auth.setup.ts`; create `tests/p2-acceptance/auth-strict.spec.ts` and helpers beneath `tests/p2-acceptance/support/`.

- [x] Write RED tests/config assertions for strict mode missing-input failures, UI login, supported TOTP enrollment/challenge, authoritative role/tenant/assignment/AAL validation, stale/wrong-role rejection, owner-only storage files, and cleanup.
- [x] Implement `P2_ACCEPTANCE_STRICT=1` behavior while preserving ordinary developer skip mode.
- [x] Generate Admin/PRO AAL2 states through visible application forms; Customer/Employee through the same login form; never craft browser state.
- [x] Run strict auth acquisition and invariant assertions GREEN.

### Task 4: Frozen route manifest and Tier A

**Files:** create `tests/p2-acceptance/route-manifest.ts`, `all-routes.spec.ts`, diagnostic/network/theme/axe/contrast helpers, and `playwright.p2-12.config.ts`.

- [x] Write RED manifest tests for 48/25/17/12/6=108 unique routes, alias completeness, 216 cases, and no filtered/skipped route.
- [x] Implement the frozen manifest matching the evidence matrix.
- [x] Write and run RED helper tests for canonical URL, shell/main/h1/title, settled state, overflow/clipping/images, console/pageerror/500/request failure, loopback network, theme tokens, privacy terms, and axe disposition.
- [x] Implement minimal helpers, failure screenshots, and strict JSON reconciliation with retries disabled.
- [x] Run all 216 cases and classify every failure.

### Task 5: Tier B capture and comparison

**Files:** create `tests/p2-acceptance/visual.spec.ts`, `scripts/p2-acceptance/evidence.ts`; write screenshots only to the required Reports tree.

- [x] Write RED plan-vs-capture/hash reconciliation tests.
- [x] Capture specified 1440×900, exact 1536×1024, and targeted 1920×1080 light/dark states at device scale 1.
- [x] Review side-by-side hierarchy against the four authoritative references and accepted parity matrices; record privacy and visual decisions.
- [x] Hash actual PNGs and prove plan/file/manifest reconciliation GREEN.

### Task 6: Tier C and computed contrast

**Files:** create `tests/p2-acceptance/interactions.spec.ts`, `security.spec.ts`, and `contrast.spec.ts`.

- [x] Write journeys named in the keyboard plan, using only allowlisted fixture mutations and real app contracts.
- [x] Run keyboard/focus/form/dialog/table/filter/chart/timeline/unavailable/error/permission/MFA/security journeys.
- [x] Measure rendered foreground/background/focus/control pairs in both themes, including transparency/gradient worst points; retain every nonzero finding and disposition.
- [x] Reset each mutated fixture record and verify required audit/revalidation outcomes.

### Task 7: Defects via strict TDD

**Files:** only the smallest affected frontend/helper files plus focused regression tests.

- [x] For each candidate or inherited acceptance defect, capture the first failing case and classify it.
- [x] Add the smallest failing source/browser regression; verify RED.
- [x] Apply the minimal contract-preserving fix; verify focused GREEN, exact browser rerun, and all affected role/shared consumers.
- [x] Do not implement missing Phase 3 contracts; keep truthful unavailable states.

### Task 8: Gates, evidence, teardown, and commit

**Files:** complete every required P2.12 evidence ledger, `docs/roadmap.md`, and `Reports/daily-work-report.md` only if all mandatory acceptance gates pass.

- [x] Run focused, affected, audit, explicit aggregate, independent scanner, TypeScript, lint, changed Prettier, diff, build, strict Playwright, hash reconciliation, and secret/privacy scans with exact results.
- [x] Complete result matrices, defect ledger, handoffs, inventory, and verification; update roadmap/report only if zero required failures/skips/missing remain.
- [x] Teardown and scan for secret/session/trace/temp artifacts.
- [x] Commit the candidate, rerun final provenance/status gates, and leave the worktree clean. Do not merge, push, deploy, or touch remote data.
