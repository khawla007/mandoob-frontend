# Production Schema Preservation Recovery Design

## Context

The production frontend is deployed from `main`, but the production Supabase migration ledger stops at `20260812140000`. Thirty-seven repository migrations remain unapplied. The deployed PRO authorization path requires `pro_company_assignments` and normalized PRO credential functions introduced by those migrations, so a successful PRO password login currently fails closed and returns to `/login`.

Migration `20260817090000_0059_company_workspace_rebase.sql` currently contains a development-only `truncate ... cascade`. Production contains one company, one linked customer profile, two documents, and one renewal that must be preserved. The destructive statement cannot be applied to production.

Production also contains two active PRO identities with no `pro_profiles` rows. The recently used Firm PRO Admin account is the intended company operator. Nova PRO Admin must remain active but unassigned.

## Goals

- Preserve every existing production business row and stable identifier through the client-to-company schema rebase.
- Apply the complete pending migration sequence without bypassing the migration ledger.
- Reconcile missing PRO role rows.
- Assign Firm PRO Admin to the existing company.
- Create a clearly labelled temporary verified test licence for Firm PRO Admin so the PRO dashboard can authorize it.
- Verify Admin, PRO, public health, and persisted-data invariants after deployment.

## Non-goals

- Do not reset, reseed, truncate, or recreate production.
- Do not assign Nova PRO Admin to a company.
- Do not invent a real licence identifier or represent the temporary credential as regulatory evidence.
- Do not weaken the current verified-licence authorization rule.
- Do not modify user passwords or MFA factors.

## Chosen approach

Amend the not-yet-applied `0059` migration into a preservation migration. The migration will retain its version because production has never recorded that version, while environments that already applied the development rebase already have the same target schema. Static migration tests will explicitly enforce that `0059` contains no `TRUNCATE` or destructive legacy-row deletion.

Before any remote write, take schema and data backups and capture a redacted invariant manifest containing row counts and relationship checks. Restore the production snapshot into an isolated local Supabase database, apply all 37 pending migrations there, and compare the post-migration manifest. Production push is permitted only if rehearsal passes.

## Data-preserving rebase

The revised `0059` migration will:

1. Fail before mutation if a tenant owns more than one legacy company, if a legacy company points to a missing/inactive/non-PRO assignee, if the same PRO is assigned to multiple companies, or if incompatible legacy client-import jobs exist.
2. Rename `clients` to `company_profiles`; PostgreSQL will retain dependent rows and update foreign-key targets.
3. Rename every `client_id`/`linked_client_id`/`parent_client_id` column in place.
4. Create the assignment ledger before removing `assigned_pro_profile_id`.
5. Backfill one active assignment for each legacy assigned company. `assigned_by` will be the oldest active platform operator, chosen deterministically; the migration fails if an assigned company exists but no such operator exists.
6. Drop the legacy assignment column only after the assignment count and identity mapping verify.
7. Reject incompatible client import jobs instead of deleting them.
8. Preserve all remaining existing view, function, policy, trigger, constraint, and index transformations from the original migration.

The complete migration remains transactional, so any failed precondition or statement rolls back `0059`.

## PRO recovery reconciliation

After the normalized PRO lifecycle migrations are applied, a narrowly scoped operational reconciliation will:

- Insert missing `pro_profiles` rows for active `profiles.role = 'pro'` identities, without changing profile identities or metadata.
- Select Firm PRO Admin by its exact existing auth identity and verify it is the most recently used PRO account.
- Assign it to the sole existing company through the production assignment workflow or an equivalent audited transaction.
- Insert a temporary `pro_license` credential with no fabricated identifier, issuing authority `Mandoob temporary test credential`, issue date `2026-09-15`, expiry date `2027-09-15`, state `verified`, and a recorded platform-operator actor.
- Record the corresponding credential decision and administrative/tenant audit records required by the normalized schema.
- Leave Nova PRO Admin unassigned and without a verified credential.

## Backup and rollback

- Store timestamped schema and data dumps outside the repository under a protected temporary directory.
- Record backup checksums and confirm both files are non-empty before migration.
- Do not print database credentials, auth identifiers, tokens, or dump contents.
- Stop before production if the restore rehearsal or any invariant check fails.
- Because later migrations are individually transactional, a production failure after some versions apply is handled by a forward corrective migration. A full database restore is reserved for confirmed data loss or unrecoverable integrity failure.

## Verification gates

Pre- and post-migration checks must compare:

- Tenant, company, customer-profile, document, renewal, invoice, meeting, service-case, employee, and import-job row counts.
- Stable company and dependent-record identifiers.
- Every dependent company foreign key and tenant/company ownership pair.
- Migration ledger parity with the repository.
- Existence and callable behavior of `read_authoritative_pro_tenant` and `authorize_pro_company_access`.
- Firm PRO Admin has exactly one active assignment, one `pro_profiles` row, and one current verified temporary test licence.
- Nova PRO Admin has no active assignment.
- Production `/api/v1/public/health` succeeds.
- Fresh Firm PRO login reaches its tenant dashboard; MFA enrollment remains required by the existing policy.

No completion claim is made without fresh command output for backups, rehearsal, production migration status, row invariants, and live-route verification.
