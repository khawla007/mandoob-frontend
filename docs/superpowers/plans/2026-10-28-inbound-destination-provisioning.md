# Inbound Destination Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secret-backed, service-role-only, audited and replay-safe inbound destination provisioning/re-key path that never enables providers by default.

**Architecture:** Migration 0121 exposes one transactional RPC that accepts only a precomputed v1 HMAC and validates ownership, readiness, and operation replay. A server-only helper owns plaintext normalization/HMAC computation and invokes the RPC with disabled defaults; a checked runbook fixes deploy order.

**Tech Stack:** PostgreSQL/PLpgSQL, Supabase generated types, TypeScript, Zod, Node test runner.

---

### Task 1: Transactional provisioning RPC

**Files:**

- Create: `supabase/migrations/20261027090000_0121_inbound_destination_provisioning.sql`
- Modify: `supabase/tests/inbound_webhook_atomic_lifecycle.sql`
- Modify: `src/lib/data/inbound-webhook-atomic-migration.test.ts`

- [ ] Write static and SQL fixture assertions for service-role-only grants, disabled default, explicit readiness, tenant/company ownership, hash ownership, idempotent operation replay, and an atomic platform audit row.
- [ ] Run the focused migration test and confirm it fails because 0121 and the RPC do not exist.
- [ ] Implement the security-definer RPC with fixed search path and explicit revokes/grant.
- [ ] Run the focused test and disposable SQL fixture to confirm they pass.
- [ ] Commit only Task 1 files and notify the schema/types agent to regenerate official types.

### Task 2: Server-only provisioning helper

**Files:**

- Create: `src/lib/events/inbound-destination-provisioning.ts`
- Create: `src/lib/events/inbound-destination-provisioning.test.ts`
- Modify after official regeneration: `src/lib/db/database.types.ts`

- [ ] Write tests proving deterministic secret-backed HMAC input, fail-closed secret handling, disabled defaults, explicit readiness gating, typed RPC arguments/results, sanitized errors, and no provider API dependency.
- [ ] Run the helper test and confirm it fails because the helper does not exist.
- [ ] Implement the minimal server-only helper using `hashDestinationKey` and the generated RPC contract.
- [ ] Run helper and related inbound tests to confirm they pass.

### Task 3: Checked deployment ordering and final verification

**Files:**

- Create: `docs/ops/inbound-destination-provisioning.md`

- [ ] Add a runbook requiring migration/types deployment, consistent secret configuration, disabled dry-run provisioning, audit/ownership verification, and a separate readiness-approved enable step.
- [ ] Add checked commands that do not expose plaintext destinations or secret values in logs.
- [ ] Run focused inbound/signature/SMS/WhatsApp tests, TypeScript, scoped ESLint, Prettier check, SQL/static migration checks, and `git diff --check`.
- [ ] Self-review least privilege, error sanitization, default-off behavior, audit atomicity, and file scope; commit Task5 files only.
