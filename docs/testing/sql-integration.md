# Isolated SQL integration target

Run the executable migration and SQL-fixture gate with:

```bash
npm run test:sql:integration
```

The target starts a disposable Supabase PostgreSQL 17.11 container without publishing a host port, installs only the local auth/storage primitives required by the migration chain, applies migrations in filename order, and executes these rollback-only fixtures with `ON_ERROR_STOP`:

- `supabase/tests/event_queue_foundation.sql`
- `supabase/tests/p3_10_operational_runtime.sql`
- `supabase/tests/inbound_webhook_atomic_lifecycle.sql`

The one-time production-data recovery migration `20260915090000_0087_reconcile_existing_pro_access.sql` is the only skip. It is printed as a reduced-scope launch blocker and is never counted as a pass. Any other migration or fixture error fails the command. A cleanup trap removes the disposable container on success, failure, or interruption.

The target does not read Supabase credentials, link a remote project, publish ports, call providers, or mutate production. CI runs the same package script for migration, fixture, runner, and workflow changes.

After the rollback-only fixtures, the target also opens two simultaneous local database sessions with one synthetic provisioning operation. It requires one mutation and one replay with the same immutable result, then verifies one destination, receipt, and audit event. This probe commits only inside the disposable container, which is destroyed by the cleanup trap.
