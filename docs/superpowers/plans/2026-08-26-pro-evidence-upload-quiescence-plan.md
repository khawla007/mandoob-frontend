# PRO Evidence Upload Quiescence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound Storage writes, retain two-pass cleanup tombstones, and mutually exclude evidence upload and removal prepares.

**Architecture:** The route aborts the actual Supabase Storage fetch after 120 seconds. Migration `0086e` turns cleanup into a leased two-pass state machine with a five-minute quiescence and retained cleaned tombstones, and replaces both prepare RPCs with credential-first cross-protocol checks.

**Tech Stack:** Next.js route handlers, TypeScript, Supabase Storage JS, PostgreSQL/PLpgSQL, Node test runner.

---

### Task 1: Abort the real Storage request

**Files:**

- Modify: `src/lib/supabase/service-role.ts`
- Create: `src/lib/supabase/service-role.test.ts`
- Modify: `src/app/api/v1/account/pro/credentials/evidence/route.ts`
- Test: `src/app/api/v1/account/pro/credentials/evidence/route.test.ts`

- [ ] Add a failing service-role test that intercepts the Storage upload fetch and asserts the exact
      `AbortSignal` is present on `RequestInit.signal`.
- [ ] Add a failing route test whose injected store ignores abort and resolves late; assert the route
      returns before that promise and the store observes `signal.aborted`.
- [ ] Run both tests and verify failures mention the missing signal/deadline behavior.
- [ ] Add an optional `{ signal?: AbortSignal }` to the service-role client and install a custom global
      fetch wrapper:

```ts
global: options.signal
  ? { fetch: (input, init) => fetch(input, { ...init, signal: options.signal }) }
  : undefined;
```

- [ ] Change `Deps.store` to accept a signal and wrap it in a 120-second `AbortController` deadline
      using `Promise.race`; clear the timer in `finally` and suppress only the late promise settlement.
- [ ] Run the two focused tests and verify they pass.

### Task 2: Two-pass cleanup worker

**Files:**

- Modify: `src/lib/data/pro-evidence-upload-cleanup.ts`
- Test: `src/lib/data/pro-evidence-upload-cleanup.test.ts`
- Modify: `src/app/api/v1/cron/cleanup-pro-credential-evidence-uploads/route.ts`
- Test: `src/app/api/v1/cron/cleanup-pro-credential-evidence-uploads/route.test.ts`

- [ ] Add failing worker tests for `quiescing` first-pass and `cleaned` second-pass results and retain
      the existing ambiguous erase/finalize retry assertions.
- [ ] Add the deterministic route/worker race: route timeout, first erase, late store resolution,
      second erase, cleaned tombstone; assert the object is absent only after the second pass.
- [ ] Run these tests and verify RED on the unknown `quiescing` result/count.
- [ ] Extend finalization parsing and aggregate counts to `quiescing`, `cleaned`, `referenced`, and
      `retryable`; expose aggregate counts only.
- [ ] Run the route, worker, and cron tests and verify GREEN.

### Task 3: Forward cleanup state-machine migration

**Files:**

- Create: `supabase/migrations/20260826105000_0086e_pro_evidence_upload_quiescence.sql`
- Modify: `src/lib/db/database.types.ts`
- Modify: `src/lib/data/pro-lifecycle-migration.test.ts`
- Modify: `supabase/tests/pro_credential_evidence_upload_cleanup.sql`

- [ ] Add static RED assertions for `cleanup_passes`, `cleaned`, five-minute quiescence, no immediate
      reservation delete, bounded 30-day cleanup of both tombstone states, fixed search paths, postgres
      ownership, and unchanged service-role-only grants.
- [ ] Add live fixture assertions that the first finalize returns `quiescing`, cannot be reclaimed
      early, the later pass returns `cleaned`, and retention removes old cleaned/finalized rows only.
- [ ] Run static tests and verify the missing `0086e` migration fails.
- [ ] Implement the migration state machine:

```sql
if v_reservation.cleanup_passes = 0 then
  update ... set status = 'cleanup', cleanup_passes = 1,
    cleanup_after = pg_catalog.now() + interval '5 minutes';
  return jsonb_build_object('status', 'quiescing');
else
  update ... set status = 'cleaned', cleanup_passes = 2, finalized_at = now();
  return jsonb_build_object('status', 'cleaned');
end if;
```

- [ ] Update generated reservation row/insert/update types with `cleanup_passes`.
- [ ] Run static and live fixture tests and verify GREEN.

### Task 4: Cross-protocol mutual exclusion

**Files:**

- Modify: `supabase/migrations/20260826105000_0086e_pro_evidence_upload_quiescence.sql`
- Create: `supabase/tests/pro_evidence_protocol_mutex_setup.sql`
- Create: `supabase/tests/pro_evidence_protocol_mutex_upload_a.sql`
- Create: `supabase/tests/pro_evidence_protocol_mutex_removal_b.sql`
- Create: `supabase/tests/pro_evidence_protocol_mutex_removal_a.sql`
- Create: `supabase/tests/pro_evidence_protocol_mutex_upload_b.sql`
- Create: `supabase/tests/pro_evidence_protocol_mutex_teardown.sql`
- Modify: `src/lib/data/pro-lifecycle-migration.test.ts`

- [ ] Add static RED assertions that upload prepare checks active removal after credential `FOR UPDATE`,
      and removal prepare checks active upload after credential `FOR UPDATE` in new and resume paths.
- [ ] Add two lock-controlled SQL races. In each direction, session A holds the credential lock after
      preparing one protocol; session B attempts the opposing prepare and must return the matching
      `*_IN_PROGRESS` error after A commits, without deadlock or an opposing reservation.
- [ ] Run static tests and verify RED on missing mutex checks.
- [ ] Replace both prepare RPCs in `0086e`, preserving exact payload/replay semantics and ensuring
      each side-effect-capable path locks the credential before checking the opposing active statuses.
- [ ] Run both two-session fixtures and verify one safe winner, no deadlock, and usable winning lease.

### Task 5: Final-schema regression and verification

**Files:**

- Modify: `supabase/tests/pro_credential_evidence_upload_reservations.sql`
- Modify: `docs/ops/pro-credential-evidence-upload-cleanup.md`

- [ ] Replace the dropped legacy cleanup call with the final claim/finalize protocol and assert a
      referenced path is excluded from claims.
- [ ] Update the runbook with the 120-second deadline, five-minute quiescence, two erase passes, and
      30-day cleaned/finalized tombstone retention.
- [ ] Run the upload-reservation fixture against the final schema.
- [ ] Run focused route/data/static tests, live cleanup and mutex SQL, TypeScript, ESLint, Prettier,
      and `git diff --check`; do not run the broad suite.
- [ ] Self-review security, lock ordering, ambiguous outcomes, and output sanitization.
- [ ] Commit the focused implementation without amending earlier commits.
