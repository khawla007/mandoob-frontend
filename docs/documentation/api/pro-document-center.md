# PRO Document Center API Contract

## Boundary and authorization

The Document Center is a server-rendered PRO workspace at `/t/{pro-slug}/documents`. Before any service-role read, the page obtains a fresh PRO session, resolves the URL slug, requires a live assignment to the tenant's company, and requires that tenant to be active. An unknown slug returns not found; a cross-company session is forbidden.

Every server action repeats that authorization sequence. A previous page render is not treated as authorization for a request, review, open, history, or expiry action. Service-role calls are private server implementation details: the four RPCs used by Document Center revoke execution from `public`, `anon`, and `authenticated` and grant it only to `service_role`.

Ownership is proven through linked records, not by trusting a caller-supplied tenant or company ID:

- queue rows join request/document records to the one company in the tenant;
- version history proves `document -> company -> tenant` and reads only versions sharing that chain;
- opening proves the technical `version -> document -> company -> tenant` chain before signing storage;
- review proves and locks `version -> document -> company -> tenant`, and also the linked request when present;
- expiry proves and locks `document -> company -> tenant` and proves the linked employee when present;
- request creation derives the company from the live assignment rather than accepting a selector.

Cross-company or broken ownership chains are returned as not found where applicable so that record existence is not disclosed.

## Queue RPC

`public.list_pro_document_center` is a `stable`, `security invoker` SQL function. The server calls it with a fixed maximum page size of 50.

### Arguments

| Argument                       | Type      | Default   | Contract                                                                                         |
| ------------------------------ | --------- | --------- | ------------------------------------------------------------------------------------------------ |
| `p_tenant_id`                  | `uuid`    | required  | Authoritative workspace scope.                                                                   |
| `p_view`                       | `text`    | `all`     | `all`, `requested`, `submitted`, `approved`, `rejected`, `expiring`, or `overdue`.               |
| `p_search`                     | `text`    | `null`    | Case-insensitive substring across company, employee, label, type, requester, and reviewer names. |
| `p_company_id`                 | `uuid`    | `null`    | Exact company filter; the PRO page supplies its assigned company.                                |
| `p_doc_type`                   | `text`    | `null`    | One supported document type.                                                                     |
| `p_due_from`, `p_due_to`       | `date`    | `null`    | Inclusive request-due bounds using the Dubai calendar date.                                      |
| `p_expiry_from`, `p_expiry_to` | `date`    | `null`    | Inclusive effective-expiry bounds.                                                               |
| `p_sort`                       | `text`    | `urgency` | `urgency`, `newest`, `oldest`, `due_date`, or `expiry_date`.                                     |
| `p_focus_kind`                 | `text`    | `null`    | `request` or `document`; must be paired with `p_focus_id`.                                       |
| `p_focus_id`                   | `uuid`    | `null`    | Exact focused entity.                                                                            |
| `p_page`                       | `integer` | `1`       | Requested one-based page.                                                                        |
| `p_page_size`                  | `integer` | `50`      | Clamped to 1–50 in SQL.                                                                          |

Invalid enum combinations, reversed date ranges, incomplete focus values, or null page inputs produce no rows. URL inputs are validated before this call, repeated parameters use the first value, malformed values fall back to safe defaults, and an exact request/document focus forces page 1.

### Rows and pagination

The function unions two entity shapes:

- pending requests that do not yet have a document head; and
- document heads with their current version and optional linked request.

Each row returns:

```text
entity_kind, entity_id, tenant_id, company_id, company_name, company_status,
employee_id, employee_name, doc_type, label,
request_id, request_status, due_at, requested_by, requested_by_name,
document_id, current_version_id, current_version_created_at,
current_version_mime_type, current_version_size_bytes,
review_status, review_note, reviewed_by, reviewed_by_name, reviewed_at,
effective_expires_on, expiry_source, created_at, total_count, effective_page
```

`total_count` is an exact `count(*) over()` after all filters and before pagination. `effective_page` clamps the requested page to the last available page (or 1 for an empty result), so the SQL offset and the page displayed by the server agree. The data layer returns `{ rows, total, page, pageSize: 50 }`; an empty response becomes total 0, page 1.

Ordering is deterministic. Urgency ranks work in this order: overdue pending requests; rejected documents needing resubmission; pending-review documents; remaining pending requests awaiting upload; documents with a dated expiry; and passive remainder rows. Requests are ordered by earliest due date within their urgency tier, rejected/pending-review documents by oldest current upload, and dated-expiry documents by earliest expiry. `entity_kind` and `entity_id` are the final stable tie-breakers. Other sorts use creation, due, or expiry dates as named and retain the same stable tie-breakers.

The six summary counts use independent calls to the same RPC. A failed count is represented separately as `{ ok: false }` and does not hide successful metrics.

## Effective dates and expiry ownership

All operational date boundaries use `Asia/Dubai`. `expiring` includes today through today + 30 days, inclusive. `overdue` includes request due dates strictly before today.

Preset window values are `all`, `overdue`, `7`, `30`, and `90`. `all` preserves an optional custom `from`/`to` range. Every non-`all` preset replaces—not combines with—the custom range: `overdue` becomes no lower bound through Dubai today - 1 day, while `7`, `30`, and `90` become Dubai today through today + the selected number of days, inclusive. The resulting bounds are sent as due-date filters for `requested` and `overdue` views; every other view sends them as expiry-date filters.

The effective expiry and its owner are:

| Document relationship       | Effective field                   | `expiry_source`        | Editable here |
| --------------------------- | --------------------------------- | ---------------------- | ------------- |
| Trade licence               | `company_profiles.license_expiry` | `company_license`      | No            |
| Employee-linked visa        | `employees.visa_expiry`           | `employee_visa`        | No            |
| Employee-linked Emirates ID | `employees.eid_expiry`            | `employee_emirates_id` | No            |
| Any other document          | `documents.expires_on`            | `document`             | Yes           |

## Version history RPC

`public.get_pro_document_version_history(p_tenant_id uuid, p_document_id uuid)` returns one JSON snapshot or `null` when the owned document does not exist. The envelope is:

```json
{
  "documentId": "uuid",
  "currentVersionId": "uuid-or-null",
  "total": 2,
  "versions": []
}
```

Versions are ordered by `created_at desc, id desc`, numbered oldest-to-newest while displayed newest-first, and carry uploader/reviewer names, review state and note, size, MIME type, and a `current` flag. The data layer rejects internally inconsistent snapshots, including duplicate IDs, incorrect totals/order/numbers, or an invalid current-version marker. Uploads create new version rows; earlier versions remain available in history.

## Mutation RPCs

### Review

`public.review_document_version(p_tenant_id, p_actor_id, p_version_id, p_status, p_note, p_reviewed_at)` performs the ownership checks, row locks, review update, related head/request changes, and tenant audit insert in one transaction.

- The actor must be an active PRO with a live assignment to the active company workspace.
- Only a version whose review state is still `pending` and whose ID is still `documents.current_version_id` may be reviewed.
- Status is `approved` or `rejected`.
- A rejection requires a non-whitespace note; notes are Unicode-trimmed and limited to 280 characters.
- Approval points the document head at the reviewed version and changes a linked pending request to `fulfilled`.
- Rejection does not fulfill the request.
- The version collection is preserved; review updates the selected version's review fields rather than deleting prior versions.

The RPC locks the version, document, company, and linked request before applying the transition. After the lock, it checks both the pending state and current-head identity; the version update repeats the `review_status = 'pending'` predicate, and approval repeats the current-head predicate on the document update. A stale, already-reviewed, or superseded version raises database conflict `MD409` (`document_review_conflict`). The data layer maps that to a conflict-status `VALIDATION_FAILED`, and the server action returns only its sanitized localized validation result rather than the raw database message.

### Document-owned expiry

`public.set_pro_document_expiry(p_tenant_id, p_document_id, p_actor_id, p_expires_on)` accepts a date or `null` and returns `document_id`, authoritative `company_id`, and `expires_on`. It checks an active tenant and PRO, locks and verifies the ownership chain, rejects externally managed expiry with `MD409`, updates `documents.expires_on`, and writes the tenant audit entry atomically.

Auth-event telemetry is attempted after a successful review or expiry transaction. Telemetry failure is logged safely and does not undo the committed database mutation.

## Signed document URLs

Open actions return `{ url, expiresAt }` only after full ownership validation. Signed URLs use the private `tenant-documents` bucket, default to 300 seconds, and accept only integer TTLs from 1 through 300 seconds.

The stored key must have exactly this generated shape:

```text
{lowercase tenant UUID}/{lowercase company UUID}/{supported doc type}/
{YYYY-MM-DD}_{optional lowercase base36 upload stamp_}{12 lowercase hex hash}_{safe filename}.{pdf|jpg|png|docx|xlsx}
```

The optional stamp preserves compatibility with legacy generated keys; new uploads include it. Empty, dot, traversal, encoded-percent, backslash, control-character, mismatched tenant/company, unsupported-type, or non-generated keys are never signed.

## Server actions and result codes

Document Center actions return a discriminated result: success is `{ ok: true, code: "SUCCESS", data }`; failures are `{ ok: false, code, messageKey }`. Expected codes are `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TENANT_NOT_FOUND`, `TENANT_INACTIVE`, `EXPIRY_EXTERNALLY_MANAGED`, `STORAGE_SIGN_FAILED`, and `INTERNAL`. User-facing failures use localization keys; raw database, storage, exception, request-header, and stack details are not returned. Unexpected details go only through sanitized structured logging.

Successful request, review, and expiry actions revalidate both `/t/{pro-slug}/documents` and `/t/{pro-slug}/company`. The company ID returned by mutations is authoritative and is never accepted as a company selector. Open and history are read actions and do not revalidate.

After creating a request, the server attempts a tenant audit record and auth-event telemetry; failures are safely logged and do not roll back the request. Current notification sequencing then requires a linked customer profile and auth-user email; without both, no notification channel is attempted. The Email enqueue is awaited first. Only after it succeeds does the server attempt WhatsApp and then SMS when a profile phone exists; those two attempts are individually best-effort. If the resolved profile has no phone, the server makes best-effort attempts to record WhatsApp and SMS skips in the tenant audit log. Any notification-stage failure is caught by request creation, so it does not undo or report failure for the already-created request. This email-first dependency is a current implementation limitation, not independent channel fan-out.
