# PRO Document Center Design

**Date:** 2026-08-13
**Status:** Approved for implementation
**Route:** `/t/[tenant]/documents`

## Goal

Replace the placeholder PRO Documents route with a secure, firm-wide operational workspace that unifies document requests and uploaded documents while preserving the existing client-level pipeline, customer uploads, private storage, review workflow, notifications, audit records, and append-only versions.

## Boundaries

The feature covers the PRO firm-wide workspace, document expiry metadata, the PRD document-type expansion, scoped version history, and existing request/review/open workflows. It does not add deletion, OCR, inline previews, drag-and-drop, employee registry work, communications-center work, or unrelated dashboard redesign.

## Authorization and ownership

The page authorizes itself before any service-role read. It resolves the authenticated user and profile, the requested PRO slug, the exact firm, active membership, and the `pro` role. Unknown, inactive, unauthenticated, and cross-firm requests fail without exposing entity existence.

Every service-role read and mutation is scoped through the full ownership chain:

- Firm queue and counts: `tenant_id` plus firm-owned clients.
- Requests: request → client → tenant.
- Documents: document → client → tenant.
- Versions and signed URLs: version → document → client → tenant.

A client, request, document, or version identifier never authorizes access by itself. Existing RLS remains defense in depth; service-role reads require explicit application authorization.

## Schema and expiry ownership

A forward-only migration will:

- Add nullable `documents.expires_on date`.
- Expand the locked document-type checks on `documents` and `document_requests` to include `aoa`, `bank_reference_letter`, `noc`, `cv_resume`, `office_lease`, `medical_certificate`, and `insurance_policy`, while preserving all existing values and rows.
- Add only indexes used by the firm queue, expiry filter, and version-history ordering.
- Add a read-only firm-scoped queue RPC that performs filtering, stable ordering, 50-row range pagination, and exact counting in PostgreSQL.

Expiry has one authoritative owner per domain:

- Trade-license documents read expiry from `clients.license_expiry`.
- Employee-linked visa and Emirates ID documents read expiry from the matching employee record.
- All other document types use `documents.expires_on`.

The UI does not copy an authoritative client or employee date into `documents.expires_on`. The explicit PRO expiry action updates only document-owned expiry. Date filtering and boundary tests use `Asia/Dubai` business dates rather than upload timestamps or fabricated expiry values.

## Firm-wide queue contract

The PostgreSQL RPC returns a tagged union of open requests and uploaded document heads. Each row contains the firm and client identity required for display, request/review state, due and effective expiry dates, current-version metadata, requester/reviewer metadata when present, and a deterministic primary action.

Supported validated URL state includes:

- View: all, requested, submitted/awaiting review, approved, rejected, expiring, and overdue.
- Client and document type.
- Due or expiry window.
- Search across client company, document label, and type.
- Sort: urgency, newest, oldest, due date, and expiry date.
- Page, plus exact request or document focus identifiers.

Repeated values are reduced safely to one validated value. Invalid identifiers, dates, enums, and page numbers fall back deterministically. Active filters survive pagination and relevant drilldowns. Stable ordering always includes an identifier tie-breaker, and exact counts remain correct beyond the Supabase 1,000-row response cap.

## Summary data

Six independent counts cover awaiting customer upload, awaiting PRO review, approved, rejected requiring resubmission, expiring within 30 days, and overdue requests. Each widget links to a filtered queue state that consumes the corresponding URL filter. Count failures degrade per widget with localized recovery UI; a failed count does not hide healthy counts or the queue.

## Actions and reuse

The firm-wide page reuses the existing secure workflows and data-layer behavior:

- Request a document after validating fresh PRO membership and selected client ownership; retain Email, WhatsApp, and SMS fan-out.
- Open the current version with a short-lived signed URL after full ownership-chain authorization.
- Approve or reject a pending version; rejection requires a non-empty localized note, and approval retains request-fulfillment behavior.
- Open the corresponding client profile.
- Inspect all append-only versions through a scoped version-history read.
- Set or update document-owned expiry with ISO-date validation and Dubai boundary handling.

Actions return sanitized typed results, write the existing audit/authentication events, and revalidate the affected firm-wide and client-detail routes. Visible success and failure feedback uses accessible live regions. No destructive deletion is introduced.

## UI composition

The selected layout is a queue-first operational workspace consistent with Mandoob Signal Studio:

1. A compact localized page heading and one primary “Request document” action.
2. Six responsive summary widgets in a coherent semantic family: informational blue, review orange, approved mint, rejected/overdue coral, and expiry sand. Each uses a distinct low-contrast geometric motif plus a text/icon cue, native link semantics, visible focus, and reduced-motion-safe interactive shine.
3. A full-width signal panel containing search, primary filters, an accessible mobile filter disclosure, applied-filter chips, sort, reset, exact result count, and the operational queue.
4. A dense semantic table on wide layouts with deliberate container scrolling on narrow layouts. The page itself never overflows at 390 pixels.
5. Dialogs for requesting a document, rejecting a version, setting expiry, and viewing version history.

Rows prioritize client, document label/type, request and review states, due date, effective expiry, upload time, file metadata, actor metadata, and the next action. Status is never communicated by color alone. Loading skeletons match the final geometry; empty states explain whether no data or active filters caused the result; partial and page errors provide useful localized recovery.

All visible copy comes from `next-intl`. English and Arabic keys remain in parity, dates/numbers/file sizes use explicit locale formatting, logical CSS supports RTL, icon-only controls have accessible names, and dialog/table/form/live-region semantics meet WCAG 2.1 AA expectations in light and dark modes.

## Error handling

- Authorization errors use the established route behavior and reveal no database messages or storage paths.
- Invalid URL state is normalized, not echoed into queries.
- Independent summary reads are guarded separately.
- Queue read failure produces a recoverable workspace error.
- Actions translate validation, authorization, storage, and database failures into stable user-facing messages while logging operational detail server-side.
- Cache revalidation occurs only after successful mutation.

## Test strategy

Implementation follows red-green-refactor. Focused tests cover:

- Unknown, cross-firm, inactive, and unauthenticated page access.
- Firm isolation for queue rows, counts, clients, requests, documents, versions, signed URLs, and mutations.
- Every status view, search, sort, repeated parameter, invalid date/identifier, and filter-preserving pagination path.
- Exact pagination and stable ordering beyond 1,000 rows.
- Exact dashboard request/document focus targets.
- Approve, reject, request, expiry-update, and version-history behavior.
- Current-version selection and append-only history ordering.
- Dubai midnight and 30-day expiry boundaries.
- English/Arabic parity, RTL order, keyboard semantics, responsive contracts, loading, empty, partial-error, and page-error states.

Final automated gates are TypeScript, ESLint, Prettier on changed files, `git diff --check`, focused tests, explicit full source-test enumeration, and the production build. Authenticated acceptance uses a user-provided saved PRO browser session at the required desktop, tablet, and mobile viewports in English/Arabic and light/dark modes, including console and axe checks. Evidence is stored under `Reports/launch-gate-evidence/2026-08-13/pro-document-center`.
