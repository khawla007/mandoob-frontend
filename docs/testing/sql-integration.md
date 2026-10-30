# Isolated SQL integration target

Run the executable migration and SQL-fixture gate with:

```bash
npm run test:sql:integration
```

The target starts a disposable Supabase PostgreSQL 17.11 container without publishing a host port, installs only the local auth/storage primitives required by the migration chain, applies migrations in filename order, and executes these rollback-only fixtures with `ON_ERROR_STOP`:

- `supabase/tests/event_queue_foundation.sql`
- `supabase/tests/p3_10_operational_runtime.sql`
- `supabase/tests/inbound_webhook_atomic_lifecycle.sql`

The one-time production-data recovery migration `20260915090000_0087_reconcile_existing_pro_access.sql` remains the only skip in the ordered migration loop, so the loop must still report exactly one skip. A dedicated probe then logically copies the migrated local baseline into two isolated databases and loads synthetic `*.mandoob.local` identities—never a production export. The probe verifies the expected two-PRO preservation, the Firm-only assignment and authorization, the unassigned Nova state, credential and audit history, and the absence of fabricated commercial terms.

Migration 0087 is intentionally not idempotent. A second run must fail with `PRODUCTION_PRO_RECOVERY_TARGET_STATE_CHANGED`; the probe compares deterministic content digests across the fixture identities, company, migration targets, audit rows, and commercial terms before and after that failure. The second isolated database starts with an invalid target precondition, proves the same fail-closed error leaves all covered row content unchanged, removes only the synthetic conflicting row, reruns the migration, and verifies recovery. The runner reports `PRO_ACCESS_RECOVERY_OK success=1 replay_fail_closed=1 invalid_rollback=1 recovered=1` only after all four checks pass. Any other migration, recovery probe, or fixture error fails the command. A cleanup trap removes the disposable container and both fixture databases on success, failure, or interruption.

The target does not read Supabase credentials, link a remote project, publish ports, call providers, or mutate production. CI runs the same package script for migration, fixture, runner, and workflow changes.

After the rollback-only fixtures, the target also opens two simultaneous local database sessions with one synthetic provisioning operation. It requires one mutation and one replay with the same immutable result, then verifies one destination, receipt, and audit event. This probe commits only inside the disposable container, which is destroyed by the cleanup trap.
