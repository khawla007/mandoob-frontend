# Phase 3 Launch Security Wave 1 Design

## Purpose

Close the four Medium security findings that currently block Phase 3 launch acceptance without expanding into provider activation, production runtime cutover, legal approval, destructive privacy execution, performance testing, or accessibility testing.

The four findings are:

1. Tenant-controlled SMTP destinations can reach internal or private hosts.
2. Legacy authentication and public rate limiting fails open when its database RPC is unavailable.
3. Public and webhook request bodies are buffered before a strict size boundary is enforced.
4. SMS and WhatsApp delivery callbacks can replay or regress delivery state out of order.

## Chosen Approach

Use a focused launch-hardening patch with four isolated security boundaries and one forward-only database migration.

- Disable tenant-controlled SMTP for launch and use only the platform mail provider.
- Make every legacy authentication and public rate-limit decision fail closed on transport errors, RPC errors, exceptions, or malformed results.
- Introduce one shared bounded streaming body reader and migrate public/webhook ingress to it before parsing or signature verification.
- Persist provider delivery callbacks through one service-role-only atomic database RPC that enforces monotonic status transitions and idempotent replay.

This approach is preferred over route-only patches because it closes bypass paths at shared boundaries. A provider gateway, egress proxy, or custom SMTP allowlist is deliberately deferred because it adds operational dependencies that are unnecessary for launch.

## Architecture

### Tenant SMTP shutdown

Tenant SMTP is disabled at three layers:

- Input validation rejects attempts to enable or update tenant SMTP with a stable unavailable response.
- The authoritative settings mutation path rejects the SMTP section even if a caller bypasses the UI schema.
- Mail resolution ignores legacy enabled SMTP rows and always returns the platform Resend transport.

The existing encrypted SMTP records remain untouched for rollback or a future allowlisted implementation. No migration deletes credentials. No runtime code opens a socket to a tenant-selected host.

### Fail-closed rate limiting

The shared legacy limiter returns a typed decision rather than a boolean that silently converts infrastructure failure into allowance. Callers distinguish:

- `allowed`: continue normally;
- `limited`: return the existing rate-limit response;
- `unavailable`: return a stable temporary-unavailable response and do not execute authentication, provider, database mutation, or public submission work.

Thrown exceptions, RPC errors, null/non-boolean data, and malformed responses all map to `unavailable`. Logs contain only the route label and correlation identifier.

### Bounded ingress

A server-only request-body helper consumes the request stream incrementally and enforces a byte limit against actual bytes read.

- A declared `Content-Length` above the route limit is rejected before reading.
- Missing, malformed, or understated `Content-Length` does not bypass the streaming limit.
- Multibyte payloads are counted as bytes, not JavaScript characters.
- The reader cancels the stream on overflow and returns a stable payload-too-large error.
- Signature verification receives the exact bounded raw bytes/string; parsing happens only after the boundary and signature checks.

Route limits are explicit constants grouped by ingress class rather than scattered literals. Webhooks retain their raw-body signature semantics.

### Monotonic delivery callbacks

A forward-only migration adds a service-role-only RPC for provider delivery status application. The RPC:

- resolves the outbound message by provider and provider message identifier;
- locks the row before inspecting state;
- maps only allowlisted provider statuses;
- treats the same state as an idempotent replay;
- accepts only forward transitions according to a declared rank;
- protects terminal states from regression;
- updates timestamps monotonically and never clears earlier evidence;
- returns a redacted result such as `applied`, `replayed`, `stale`, `unknown`, or `not_found`.

Twilio, Unifonic, and WhatsApp verified callback handlers call this RPC instead of performing select-then-update sequences. The RPC is denied to anonymous and authenticated roles.

## Error and Logging Contract

- SMTP configuration attempts return a stable launch-unavailable error without revealing stored credentials.
- Limiter infrastructure failure denies the protected operation and returns a stable temporary-unavailable response.
- Oversized bodies return HTTP 413 before JSON/form parsing or business logic.
- Invalid signatures retain their existing forbidden response after bounded reading.
- Unknown or stale delivery statuses acknowledge safely without changing durable state, preventing retry storms while preserving monotonicity.
- Logs exclude secrets, request bodies, SMTP hosts, internal addresses, provider payloads, phone numbers, and message contents.

## Verification

Each finding is developed test-first with a regression that fails against the deployed baseline.

### SMTP

- Schema and mutation tests reject tenant SMTP enable/update attempts.
- Legacy enabled rows resolve to the platform transport.
- A dependency-injected transport test proves Nodemailer is never constructed or invoked.

### Rate limiting

- Shared tests cover allowance, exhaustion, RPC error, thrown exception, null/malformed data, and redacted diagnostics.
- Representative login, password-reset, registration, OTP, contact, questionnaire, estimate, and application routes prove unavailable limiter state blocks downstream work.

### Bounded ingress

- Tests cover declared oversize, chunked overflow, missing/understated `Content-Length`, multibyte boundaries, exact-limit acceptance, stream cancellation, valid signed bodies, and invalid signatures.
- Public and webhook route audits prove every body-consuming entry point uses the shared reader before parsing.

### Delivery callbacks

- SQL fixtures cover duplicate callbacks, forward progress, stale regressions, terminal protection, unknown statuses, missing messages, concurrent updates, timestamp preservation, and grants.
- Route tests prove verified callbacks use the RPC and never perform direct delivery-state updates.

### Final gates

- Focused Node tests.
- Disposable PostgreSQL integration across the complete migration chain and new callback fixture.
- Full source suite.
- Non-incremental TypeScript.
- ESLint, Prettier, and `git diff --check`.
- Production build and deploy-preview build.
- Independent security review of the exact diff.

## Rollout and Boundaries

Implementation occurs on `security/phase-3-launch-blockers-wave-1` from production merge `109ea9dfa33aa60fa6aeb6404e80f835641068aa`.

Merge and deployment require green gates and explicit authorization. Production verification is read-only and must not send provider traffic. Runtime/environment cutover, external provider credentials, formal penetration testing, performance/load tests, destructive erasure, authenticated four-role axe testing, and legal/provider approvals remain separate launch gates.

## Acceptance Criteria

Wave 1 is complete only when all four security findings have executable RED/GREEN evidence, the complete verification matrix passes, independent review has no unresolved Critical or Major finding, and the launch evidence names the exact immutable commit. Closing Wave 1 does not by itself mark Phase 3 launch accepted.
