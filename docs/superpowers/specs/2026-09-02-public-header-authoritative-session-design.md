# Public Header Authoritative Session Design

## Problem

The public header currently decides whether to show the account dropdown from a valid Supabase user token and the role metadata embedded in that token. Dashboard authorization performs a stricter live lookup of the user's `profiles` row, including active status, authoritative role, and tenant scope.

When token metadata is stale, the header can show an admin Dashboard link while `/admin` correctly rejects the account and redirects to `/login`. This creates a contradictory signed-in state.

## Decision

Use one authoritative session-resolution path for both the public header and protected role guards.

The resolver will:

- validate the Supabase user session;
- reject malformed user identifiers;
- load the live `profiles` role, status, and tenant scope;
- require an active profile;
- require platform roles to have no tenant;
- require customer and employee roles to have a valid tenant identifier;
- resolve the PRO tenant through the existing authoritative RPC; and
- fail closed on missing data or database errors.

It will return `null` for public, non-protected consumers and let protected route guards redirect denied users as they do today.

## Header Behavior

`SiteHeader` will use the authoritative resolver. It will render the account dropdown only when the live account remains authorized. Missing, inactive, malformed, role-changed, tenant-invalid, or lookup-failed sessions will render the normal **Sign in** link.

No automatic global logout will occur from a read-only page render. This avoids revoking other valid sessions because of a temporary database failure while still preventing misleading or privileged UI from appearing.

## Protected Route Behavior

Existing protected routes will retain their current allowed-role checks and redirects. Their role guard will reuse the same authoritative resolver so the header and dashboard cannot disagree about the underlying account state.

## Testing

Regression tests will cover:

- active platform administrators resolve successfully;
- stale privileged token metadata is replaced by the live role when permitted;
- inactive, missing, malformed, or tenant-scoped platform profiles fail closed;
- the public header imports and uses authoritative session resolution rather than token-only session resolution; and
- existing role-guard, TypeScript, lint, and source tests remain green.

## Scope

This change is limited to session authorization consistency. It does not redesign the header, change login credentials, alter database schema, or change dashboard permissions.
