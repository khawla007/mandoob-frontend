# Authentication P1.10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Mandoob's English desktop auth surfaces and close callback/MFA open redirects without changing accepted backend contracts.

**Architecture:** One pure shared redirect policy feeds the server callback and client MFA navigation. One reusable reference-family auth stage composes route-specific cards, while existing handlers remain authoritative and form components add safe, accessible states.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, next-intl, React Hook Form/Zod, Supabase Auth, Node test runner, CSS tokens.

---

### Task 1: Shared redirect security

**Files:** Create `src/lib/auth/safe-redirect.ts`, `src/lib/auth/safe-redirect.test.ts`; modify callback route and MFA challenge.

- [ ] Write adversarial table tests for approved relative paths and rejected absolute, scheme-relative, encoded, backslash, control, malformed, auth-loop and unsupported inputs.
- [ ] Run `node --import tsx --conditions=react-server --test src/lib/auth/safe-redirect.test.ts` and confirm failure because the module is absent.
- [ ] Implement a pure allowlist normalizer returning `/` for every rejected value.
- [ ] Run the focused test green, then add callback source tests proving failed exchange cannot imply successful navigation.
- [ ] Replace both raw consumers with the shared policy and rerun affected auth/security tests.

### Task 2: Reference-family shell

**Files:** Create `src/components/auth/AuthExperience.tsx`, `src/components/auth/AuthProviders.tsx`, tests; modify auth layout and `src/app/(public)/public-theme.css`.

- [ ] Write source/structure tests for header, split stage, four benefits, local visual, elevated card, provider region, support strip and footer.
- [ ] Run focused tests red.
- [ ] Implement the reusable semantic structure using `/hero/skyline.webp`, accepted shell and public tokens.
- [ ] Add desktop light/dark CSS, focus/reduced-motion rules, and rerun tests green.

### Task 3: Login and Customer registration

**Files:** Modify login/signin/register pages, LoginForm, RegisterForm, PasswordInput, catalogs; create focused tests.

- [ ] Write failing tests for region order, exact accepted fields, unavailable mobile/providers, localized validation, keyboard password toggle, duplicate latch and safe redirect output.
- [ ] Implement the minimal presentation/state changes without changing handler payloads.
- [ ] Run login/register tests, catalog parity and all affected handler tests green.

### Task 4: PRO review intake

**Files:** Replace `/register/pro` redirect with a page/presentation component and tests.

- [ ] Write a failing direct-route test proving no redirect and no auth mutation.
- [ ] Implement one-PRO/one-Company eligibility/review surface with safe Contact interest CTA and deterministic state geometry only.
- [ ] Verify zero mount writes and focused tests green.

### Task 5: Invitation, OTP and password recovery

**Files:** Modify route pages/forms and catalogs; add focused source/state tests.

- [ ] Write failing tests for invalid context gates, masking, anti-enumeration, autocomplete, pending latches, cooldown and sanitized errors.
- [ ] Implement safe route/card states while retaining endpoint payloads.
- [ ] Run each focused test and affected API/security tests green.

### Task 6: MFA enrollment/challenge/recovery

**Files:** Modify MFA pages/cards and catalogs; add focused tests.

- [ ] Write the failing no-mutation-on-render test and state/secret non-disclosure tests.
- [ ] Replace enrollment-on-mount with explicit start; add transient recovery-code acknowledgement and safe challenge/recovery states.
- [ ] Use the shared destination policy after success and run MFA/security consumers green.

### Task 7: Verification and evidence

**Files:** Complete P1.10 evidence, `docs/roadmap.md` and `Reports/daily-work-report.md` only after gates pass.

- [ ] Reconcile ledger totals and changed-file inventory.
- [ ] Run focused and full source tests, scanners, `npx tsc --noEmit`, lint, changed-file Prettier, `git diff --check`, and build.
- [ ] Start the isolated candidate and run safe desktop light/dark browser checks with no mutation or external traffic.
- [ ] Record exact outcomes and screenshot hashes when legitimate.
- [ ] Commit the coherent verified feature; update only P1.10 status and daily report; verify the worktree is clean.
