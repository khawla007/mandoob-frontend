# P3.13 Reduced Integration Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the safe local P3.10 runtime and core P3.13 integration verification while recording the user-approved advanced acceptance exclusions as launch blockers.

**Architecture:** Extend the frozen P3.10 v1.0.0 event interface only through forward migrations and compatible TypeScript runtime modules. A single authenticated scheduler invokes a bounded, strictly decoded worker registry; consumers project reference-only domain events into role-scoped notification, task, activity, and delivery state. Existing provider channels stay disabled until approved sandbox configuration and cutover proof exist, while inbound callbacks fail closed unless destination ownership can be resolved through the accepted destination registry.

**Tech Stack:** PostgreSQL 17/Supabase migrations and RLS, TypeScript 5, Zod, Next.js 16.2.12, React 19, Node test runner, next-intl.

**Fixed provenance:** Branch `integration/phase-3-p3-13-acceptance-2026-10-27`; starting SHA `d83143900443cd73cc6b1d2ce0cf873b34a27c38`; browser port `3113`; no merge, push, deploy, production mutation, or provider effect.

**Reduced acceptance ceiling:** The final state is `review candidate complete; launch acceptance blocked`. Performance/load/query-plan testing, penetration testing, provider/storage failure matrices, destructive erasure drills, exhaustive concurrency, full four-role UI-state/accessibility coverage, and external legal/provider approvals are not run under the user-approved reduction.

---

### Task 1: Freeze candidate integrity and reduced gate ledger

**Files:**

- Create: `docs/superpowers/plans/2026-10-27-p3-13-reduced-integration-acceptance.md`
- Create outside the frontend Git worktree: `Reports/launch-gate-evidence/2026-10-27/phase-3-public-dashboard-apis/p3-13-integration-acceptance/candidate-ancestry-and-merge-manifest.md`
- Create outside the frontend Git worktree: `Reports/launch-gate-evidence/2026-10-27/phase-3-public-dashboard-apis/p3-13-integration-acceptance/p3-contract-gap-final-ledger.md`

- [ ] Record branch, local/remote SHA, required ancestors, worktree cleanliness, protected-main binary diff hash, frozen contract counts, and reduced-scope dispositions.
- [ ] Mark every excluded advanced gate `not run — user-approved reduced scope; launch blocker`; never convert it to pass or remove it from the denominator.
- [ ] Commit the execution plan before production-code changes.

### Task 2: Add persistent operational runtime schema and least-privilege RPCs

**Files:**

- Create: `src/lib/data/p3-10-runtime-migration.test.ts`
- Create: `supabase/migrations/20261027020000_0114_p3_10_operational_runtime.sql`
- Regenerate after the final combined schema: `src/lib/db/database.types.ts`

- [ ] Write failing static tests requiring forward-only notification, task, activity, template, preference, delivery/effect receipt, and runtime-health structures with company ownership, stable ordering, RLS, fixed search paths, bounded pagination, and sanitized fields.
- [ ] Run the focused migration test and confirm it fails because migration `0114` is absent.
- [ ] Implement the smallest forward migration that supplies persistent role-scoped read models, read/unread mutation, deterministic cursor pagination, versioned templates and tenant overrides, preferences/opt-outs, effect receipts, and operator health/replay reads without enabling an external channel.
- [ ] Register only consumers that have a concrete handler; disable or disposition registrations that cannot safely execute.
- [ ] Run the focused migration test and existing event-foundation tests to green.
- [ ] Apply the final migration chain only to an approved isolated local database if one is available; otherwise record runtime SQL as blocked rather than passed.

### Task 3: Implement the bounded P3.10 worker and scheduler owner

**Files:**

- Create: `src/lib/events/worker.test.ts`
- Create: `src/lib/events/worker.ts`
- Create: `src/lib/events/runtime-handlers.test.ts`
- Create: `src/lib/events/runtime-handlers.ts`
- Create: `src/app/api/v1/cron/process-event-jobs/route.test.ts`
- Create: `src/app/api/v1/cron/process-event-jobs/route.ts`
- Modify: `src/lib/events/repository.ts`

- [ ] Write failing tests for strict claimed-job decoding, exact event/version dispatch, bounded batches, heartbeat, lease extension, poison isolation, retry/dead taxonomy, fencing, and provider-off behavior.
- [ ] Confirm the focused tests fail for the missing worker/runtime API.
- [ ] Add strict claim schemas to the repository and implement a bounded injected worker loop with one handler registry and stable external-effect keys.
- [ ] Reuse the existing employee-import and meeting-AI handlers through adapters; add safe local projection handlers for enabled internal consumers.
- [ ] Add one secret-protected cron entry point that owns the worker cadence and cannot enable legacy and event delivery simultaneously.
- [ ] Run focused worker, repository, employee-import, meeting-AI, and route tests to green.

### Task 4: Replace unavailable operational routes with role-safe read models

**Files:**

- Create: `src/lib/operations/runtime.test.ts`
- Create: `src/lib/operations/runtime.ts`
- Create: `src/components/operations/OperationalWorkspace.tsx`
- Modify: operational `communications`, `notifications`, `tasks`, and `activity` pages under `src/app/admin` and `src/app/(tenant)/t/[tenant]`
- Modify together: `src/messages/en.json`, `src/messages/ar.json`

- [ ] Write failing tests for direct role authorization, authoritative company/resource scope, deterministic pagination, read/unread mutation, unavailable channel truth, sanitized errors, and English/Arabic message parity.
- [ ] Confirm the tests fail while routes still render `OperationalUnavailableRoute`.
- [ ] Implement server-side loaders and mutations over the new RPC boundary and a shared accessible operational workspace using existing dashboard primitives.
- [ ] Preserve channel-disabled truth and do not display synthetic counts, delivery success, or provider availability.
- [ ] Run focused route, operation, localization, and authorization tests to green.

### Task 5: Retire unsafe inbound tenant inference without enabling providers

**Files:**

- Create or modify focused tests under `src/app/api/v1/webhooks/` and `src/lib/sms/`
- Modify: `src/app/api/v1/webhooks/inbound-recording.ts`
- Modify: `src/app/api/v1/webhooks/twilio/route.ts`
- Modify: `src/app/api/v1/webhooks/unifonic/route.ts`
- Modify: `src/app/api/v1/webhooks/whatsapp/route.ts`

- [ ] Write failing tests proving no callback selects the first enabled tenant, unknown destinations are non-disclosing no-ops, duplicate provider-event IDs are idempotent, timestamps fail closed, and no side effect precedes destination reservation.
- [ ] Reproduce the current unsafe first-enabled-tenant path with the focused test.
- [ ] Route callbacks through `reserve_inbound_webhook` using the provider-owned destination identifier already present in each callback contract; keep routes unavailable when that identifier or approved configuration is absent.
- [ ] Preserve raw-body signature verification and sanitized errors; do not add provider network calls.
- [ ] Run the focused inbound, signature, SMS, and WhatsApp tests to green.

### Task 6: Core schema, authorization, regression, and browser verification

**Files:**

- Create or update the required P3.13 evidence files under the canonical outer `Reports/launch-gate-evidence/.../p3-13-integration-acceptance/` directory.

- [ ] Run focused P3.10/P3.13 suites, migration/static SQL tests, and available isolated runtime fixtures.
- [ ] Run the explicit full source suite and report exact passes/failures without hiding the known Node 22/headless failures.
- [ ] Run non-incremental TypeScript, whole-project ESLint, repository Prettier check, i18n parity/source scans, secret/debug/unavailable-adapter scans, and `git diff --check`.
- [ ] Run a clean production build with safe local configuration.
- [ ] Start the candidate on port `3113` and run basic public/protected plus available authenticated English desktop smoke; record missing disposable identities as blockers.
- [ ] Recompute candidate SHA/status and protected-main binary diff hash after all changes.

### Task 7: Independent review, evidence, commit, and blocked handoff

**Files:**

- Update: `docs/roadmap.md` and `Reports/daily-work-report.md` outside the frontend Git worktree only after all results are known.
- Update: every required P3.13 evidence artifact, including `verification.md`, `changed-file-and-fix-inventory.md`, and `remaining-blockers-or-final-acceptance.md`.

- [ ] Run specification-compliance review, then code-quality/security diff review, and remediate Critical or Important findings.
- [ ] Record exact local results and explicitly mark each skipped advanced gate and missing external dependency as a launch blocker.
- [ ] Keep P3.13 and Phase 3 at `review candidate complete; launch acceptance blocked`; do not claim API acceptance.
- [ ] Commit verified frontend changes locally with focused commits. Do not push, merge, deploy, call providers, mutate production, or delete worktrees/branches.

## Self-review

- The plan preserves the immutable candidate and historical migrations.
- Every code change is test-first; generated types are regenerated once after schema completion.
- Provider channels remain disabled and inbound routing fails closed.
- Reduced testing is visible in the final ledger and cannot be mistaken for launch acceptance.
- Shared migrations, generated types, scheduler, root reports, and roadmap edits remain serialized.
