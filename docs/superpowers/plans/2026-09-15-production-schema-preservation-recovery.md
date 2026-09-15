# Production Schema Preservation Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Apply the 37 pending Supabase migrations without losing production data, then restore Firm PRO Admin dashboard access with one audited company assignment and one clearly labelled temporary verified test licence.

**Architecture:** Convert the unapplied production rebase migration into an in-place, fail-closed transformation; prove it against a restored production snapshot; then apply the same migration chain to production. Perform account reconciliation only after schema parity, through normalized lifecycle functions or an equivalent single audited transaction.

**Tech Stack:** PostgreSQL/Supabase migrations and CLI, Node.js `node:test`/tsx, Next.js, Netlify, Bash verification commands.

---

## Task 1: Establish an isolated implementation workspace

**Files:**
- No source changes

1. Detect whether the repository is already a worktree with `git rev-parse --git-dir`, `git rev-parse --git-common-dir`, `git branch --show-current`, and `git rev-parse --show-superproject-working-tree`.
2. Use an isolated git worktree if approved; otherwise continue on the explicitly approved `main` workspace.
3. Confirm the workspace begins clean except for known user-owned changes. Do not overwrite unrelated changes.
4. Record `HEAD`, branch, Supabase CLI version, Node version, and the linked migration ledger without printing credentials.

## Task 2: Add preservation regression tests (RED)

**Files:**
- Modify: `src/lib/data/company-workspace-migration.test.ts`
- Test: `src/lib/data/company-workspace-migration.test.ts`

1. Replace the development-reset assertions with assertions that migration `0059` contains no executable `TRUNCATE` and no deletion of client/company rows or client import jobs.
2. Assert that preflight validation occurs before the first schema mutation and rejects:
   - more than one company per tenant;
   - missing, inactive, or non-PRO legacy assignees;
   - one PRO assigned to multiple companies;
   - incompatible `bulk_import_jobs.kind = 'clients'` rows;
   - assigned companies when no active platform operator can be recorded as `assigned_by`.
3. Assert assignment rows are backfilled before `assigned_pro_profile_id` is dropped and that count/identity checks happen before the drop.
4. Run the focused test and confirm it fails for the expected missing preservation behavior:
   `node --import tsx --test src/lib/data/company-workspace-migration.test.ts`

## Task 3: Implement the data-preserving `0059` rebase (GREEN)

**Files:**
- Modify: `supabase/migrations/20260817090000_0059_company_workspace_rebase.sql`
- Test: `src/lib/data/company-workspace-migration.test.ts`

1. Add preflight `DO` blocks before schema mutation. Lock relevant legacy tables and fail with distinct error messages for every unsupported production shape.
2. Capture legacy company-to-PRO mappings and a deterministic active platform-operator actor before dropping any legacy field.
3. Remove the development-only `truncate table public.company_profiles cascade`.
4. Rename tables and ownership columns in place, preserving rows, identifiers, timestamps, and foreign keys.
5. Create `pro_company_assignments`, backfill each legacy assignment, and verify exact company/tenant/PRO correspondence.
6. Drop `assigned_pro_profile_id` only after the verification block succeeds.
7. Replace deletion of client import jobs with a preflight rejection; keep the enum narrowing only after the table is proven compatible.
8. Keep all remaining function, policy, trigger, index, and constraint transformations unchanged.
9. Run the focused migration test until green.
10. Run `git diff --check` and inspect the SQL diff manually for accidental destructive statements.

## Task 4: Run repository verification before database rehearsal

**Files:**
- No additional source changes expected

1. Run focused migration suites covering workspace, assignment lifecycle, PRO lifecycle, security workflows, and admin workflows.
2. Run TypeScript checking and linting.
3. Run the full test suite. If the known aggregate scanner contention recurs, record it and run its exact isolated suite with `--conditions=react-server`; stop for any new failure.
4. Run a production build if the mounted-filesystem build completes reliably; otherwise require the authoritative Netlify build later.
5. Commit the tested preservation patch before any remote mutation.

## Task 5: Create protected production backups and an invariant manifest

**Files:**
- Create only protected temporary artifacts under an exact `mktemp -d` directory in `/tmp`
- Do not add backup artifacts to git

1. Create a mode-0700 temporary backup directory and record its exact path locally without exposing secrets.
2. Dump production roles/schema and data separately with the linked Supabase CLI.
3. Confirm both dumps are non-empty, restrict them to mode 0600, and calculate SHA-256 checksums.
4. Query a redacted pre-migration invariant manifest containing only counts, boolean relationship checks, and non-secret stable-row fingerprints for tenants, clients, customer profiles, documents, renewals, invoices, meetings, service cases, employees, and import jobs.
5. Re-run `supabase db push --linked --dry-run` and require exactly the expected 37 pending migration versions.
6. Stop without touching production if a backup, checksum, preflight, or ledger check fails.

## Task 6: Restore and rehearse against an isolated local Supabase database

**Files:**
- Temporary local database state only

1. Start an isolated local Supabase stack on non-production ports and confirm its project identity cannot resolve to production.
2. Restore the production schema/data snapshot into the isolated database.
3. Apply the repository migration chain from production ledger version `20260812140000` through the latest migration.
4. Capture the post-migration invariant manifest using company terminology.
5. Compare all counts, stable fingerprints, tenant/company ownership pairs, and dependent foreign keys to the pre-migration manifest.
6. Verify migration ledger parity and callable behavior for `read_authoritative_pro_tenant` and `authorize_pro_company_access`.
7. Destroy only the exact isolated temporary stack after results and logs are retained. Stop before production on any mismatch.

## Task 7: Apply migrations to production

**Files:**
- Production database migration ledger and schema

1. Reconfirm the linked project reference and latest production ledger immediately before writing.
2. Run the migration push once, without repair, reset, seed, or force flags.
3. Capture the resulting migration status and require repository/production parity.
4. Capture the production post-migration invariant manifest and compare it with the backup manifest.
5. Stop before account reconciliation if any business-row count, identifier, ownership relationship, or foreign key differs unexpectedly.

## Task 8: Reconcile the two existing PRO identities safely

**Files:**
- Production database rows only

1. Resolve exact IDs server-side from existing immutable auth/profile relations; do not print emails, UUIDs, or tokens.
2. Require exactly two active `profiles.role = 'pro'` identities, exactly one sole company, exactly one recently signed-in Firm PRO identity, and one Nova PRO identity.
3. In one transaction, insert only missing `pro_profiles` role rows while preserving profile metadata.
4. Use `assign_pro_to_company`/the latest contextual wrapper when its preconditions permit. Otherwise perform the equivalent locked insert and required audit entries in the same transaction.
5. Create a Firm PRO credential through the normalized lifecycle workflow:
   - type: `pro_license`;
   - issuing authority: `Mandoob temporary test credential`;
   - identifier: null (never fabricate a regulator identifier);
   - issue date: `2026-09-15`;
   - expiry date: `2027-09-15`;
   - final state: `verified`;
   - actor: the existing active platform operator.
6. Record the required credential decision and admin/tenant audit events through workflow functions or equivalent audited writes.
7. Require Firm PRO to have exactly one active assignment and one current verified test credential. Require Nova PRO to have no assignment and no verified credential.
8. Do not change passwords, MFA factors, auth identities, or user metadata.

## Task 9: Verify production application behavior

**Files:**
- No source changes expected

1. Verify `/api/v1/public/health` succeeds on the configured production origin.
2. Confirm the current Netlify production deploy is ready and points to the expected `main` commit; deploy the preservation commit only if the migration-test source change requires the repository to match production operations.
3. Perform a fresh Firm PRO browser login and confirm navigation reaches `/t/<tenant>` rather than returning to `/login`.
4. Confirm expected MFA-enrollment behavior remains intact after authorization.
5. Check browser console/network errors and verify the Admin dashboard still loads.
6. Re-run sanitized database assertions for assignment, credential, migration parity, and preserved counts.

## Task 10: Finalize and report

**Files:**
- Update the project daily report identified by repository convention

1. Record the session under Completed Work: root cause, preservation patch, backups/rehearsal, applied migrations, reconciliation, deployment, and verification evidence.
2. Put only genuinely remaining items under Upcoming Work; never mark failed or skipped verification complete.
3. Commit and push all reviewed source/documentation changes to `main`.
4. Confirm the final GitHub `main` SHA and Netlify published commit agree.
5. Report the production URL, successful checks, any known non-blocking test-runner issue, and the protected backup location/retention instruction without revealing secrets.
