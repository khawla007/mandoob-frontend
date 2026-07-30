# Supabase migration-history reconciliation

Date: 2026-07-30

Production project: `mandoob` (`etttzmaxrdarkfozhukb`)

## Purpose

Production retained timestamped Supabase migration versions while this workspace
contained short numeric versions `0009`–`0046`. This document records the
evidence-based local reconciliation and its explicitly approved metadata repair.

## Evidence

- Production migration metadata contained 47 versions from
  `20260424051543` through `20260528105942`.
- Production metadata stored the name and full SQL statement for every version.
- Ignoring comments and formatting, local migrations `0009`–`0042` each matched
  exactly one stored production statement.
- A clean temporary Supabase database successfully applied the recovered
  production history followed by local migrations `0043`–`0046`.
- The resulting application `public` schema and custom storage policies matched
  production. Platform-managed Storage internals were excluded from application
  drift.

Sanitized verification artifacts were stored outside the repository under
`/tmp/mandoob-supabase-reconcile-20260730-final/`. Schema dumps and credentials
were not committed.

## Restored production migrations

The exact SQL stored in production migration metadata was restored locally for:

- `20260424051543`–`20260424105127`: original migrations `0001`–`0008`.
- `20260506054740`, `20260506061955`, `20260506062001`,
  `20260506065245`, and `20260506065251`: outbound email, WhatsApp, and
  SMS migrations.

## Renamed local migrations

| Local identifier | Production identifier |
| ---------------- | --------------------- |
| 0009             | 20260428113505        |
| 0010             | 20260428113626        |
| 0011             | 20260428113648        |
| 0012             | 20260428113708        |
| 0013             | 20260428113730        |
| 0014             | 20260430095742        |
| 0015             | 20260430104000        |
| 0016             | 20260502104635        |
| 0017             | 20260502115515        |
| 0018             | 20260504104528        |
| 0019             | 20260504112955        |
| 0020             | 20260505064629        |
| 0021             | 20260505064805        |
| 0022             | 20260505065654        |
| 0023             | 20260505080839        |
| 0024             | 20260505081404        |
| 0025             | 20260505093214        |
| 0026             | 20260505112641        |
| 0027             | 20260506083751        |
| 0028             | 20260528104639        |
| 0029             | 20260528104707        |
| 0030             | 20260528105253        |
| 0031             | 20260528105403        |
| 0032             | 20260528105422        |
| 0033             | 20260528105514        |
| 0034             | 20260528105533        |
| 0035             | 20260528105608        |
| 0036             | 20260528105637        |
| 0037             | 20260528105707        |
| 0038             | 20260528105742        |
| 0039             | 20260528105838        |
| 0040             | 20260528105907        |
| 0041             | 20260528105920        |
| 0042             | 20260528105942        |

These are identifier-only renames. Their SQL content was preserved.

## Reconciliation identifiers

The effects of migrations `0043`–`0046` are present in production, but no
production migration-history rows exist. They have been assigned new local
reconciliation identifiers:

- `20260730004300_blog_cms.sql`
- `20260730004400_blog_taxonomy_hardening.sql`
- `20260730004500_cms_pages.sql`
- `20260730004600_seed_legal_cms_pages.sql`

These identifiers record reconciliation order; they are not claimed historical
deployment timestamps.

Production did not re-run these migrations. After explicit approval,
`supabase migration repair --status applied` added history rows for only these
four versions.

## Pre-repair verification

- A clean temporary database applied all 51 reconciled migrations.
- The local migration list aligned all 51 versions.
- Supabase database lint reported no schema errors.
- The linked production migration list aligned 47 versions, with only the four
  reconciliation versions local-only and no remote-only versions.
- The linked production dry-run proposed only the four reconciliation
  migrations. It did not execute SQL.
- A fresh linked schema-diff attempt was inconclusive: the default diff
  container encountered a local address conflict, and the alternate engine was
  refused a new production connection because the server reported too many
  clients. The earlier read-only dump comparison remains the schema-drift
  baseline.

At this checkpoint, no production migration-history, schema, storage, Auth, or
customer-data change had been made.

## Approved metadata repair and post-verification

- The project name, reference, application host, organization, and `main`
  production branch were reconfirmed before every remote operation.
- Migration-history rows `20260730004300`, `20260730004400`,
  `20260730004500`, and `20260730004600` were marked applied one at a time.
- No migration SQL was executed. No application schema, storage, Auth, or
  customer data changed.
- The linked migration list aligned all 51 local and remote versions with no
  unmatched entry.
- `supabase db push --linked --dry-run` reported that the remote database was
  up to date and proposed no SQL.
- The Supabase dashboard showed each repair and verification statement with
  SQLSTATE `00000`. No new Postgres error followed the repair.
- Auth health checks returned HTTP 200 and no Auth errors appeared in the
  reviewed one-hour window.
- The production application health endpoint returned `status: ok`.
- Representative read-only `cms_pages` and `blog_posts` queries returned HTTP
  200 and rendered the Privacy Policy plus 15 public blog articles.

The canonical `mandoob.ae` hostname did not resolve from the verification
environment. Application checks therefore used the active
`mandoob-app.netlify.app` production deployment.

## Rollback

Local filenames can be restored from the mapping above; their SQL content was
not changed. If post-repair validation later fails, mark only the four
reconciliation versions `reverted`, newest first. Metadata rollback must not
execute schema SQL or modify customer data.

## Repository ownership

At audit time, root `supabase/` was not tracked by the valid `frontend/` Git
repository and the root `.git` directory was empty. The reconciled Supabase
project, drift workflow, and this document were therefore moved into the
`frontend/` repository before any production metadata repair.
