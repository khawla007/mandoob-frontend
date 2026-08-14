# Database Schema Reference

This is a focused reference for the PRO Document Center schema introduced or hardened by migrations 0057 and 0058. The generated TypeScript database types remain the source for the wider application schema.

## Document records

### `documents`

`documents` is the logical document head. Relevant columns are:

| Column               | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `id`                 | Document UUID.                                                |
| `tenant_id`          | Firm boundary.                                                |
| `client_id`          | Owning client; must share the firm.                           |
| `employee_id`        | Optional employee owner for employee-derived expiry.          |
| `request_id`         | Optional originating document request.                        |
| `doc_type`           | Locked document-type value.                                   |
| `label`              | Optional display label.                                       |
| `current_version_id` | Pointer to the current version; version rows remain separate. |
| `expires_on`         | Nullable date used only when expiry is document-owned.        |

Migration 0057 adds `expires_on date` and the partial index `documents_tenant_expiry_idx (tenant_id, expires_on, id) where expires_on is not null`.

### `document_versions`

Each upload inserts a version row containing `document_id`, `tenant_id`, private `storage_path`, MIME type, size, SHA-256, uploader, review state/note/reviewer/time, and creation time. Prior version rows remain available when a new upload becomes current. History is stably ordered by `created_at desc, id desc`, supported by `document_versions_document_created_id_idx`.

Review updates the targeted version's review fields only while that version is pending and remains `documents.current_version_id`. Approval may fulfill the linked request, but it does not delete older versions.

### `document_requests`

Requests carry `tenant_id`, `client_id`, optional `employee_id`, requester, type, label, notes, due timestamp, and `pending | fulfilled | cancelled` status. Pending requests without a document head form the queue's awaiting-upload rows. Migration 0057 adds `document_requests_tenant_status_due_idx (tenant_id, status, due_at, id)`.

## Supported document types

Both `documents.doc_type` and `document_requests.doc_type` use the same check constraint:

```text
passport
visa
emirates_id
trade_license
ejari
moa
shareholder_id
other
aoa
bank_reference_letter
noc
cv_resume
office_lease
medical_certificate
insurance_policy
```

Migration 0057 preserves the original eight values and adds `aoa`, `bank_reference_letter`, `noc`, `cv_resume`, `office_lease`, `medical_certificate`, and `insurance_policy`.

## Expiry source rules

`documents.expires_on` is not a duplicate of existing client/employee dates. Effective expiry is selected as follows:

| Relationship                | Authoritative column     |
| --------------------------- | ------------------------ |
| Trade licence               | `clients.license_expiry` |
| Employee-linked visa        | `employees.visa_expiry`  |
| Employee-linked Emirates ID | `employees.eid_expiry`   |
| Other document              | `documents.expires_on`   |

`set_pro_document_expiry` refuses the first three cases with `MD409`. It accepts a date or `null` only for document-owned expiry, after verifying the active firm, active PRO actor, document/client firm chain, and any employee/client chain. The update and `tenant_audit_log` insert are one transaction.

## Private RPC surface

| Function                           | Shape                                                               | Purpose                                                                         |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `list_pro_document_center`         | table rows with `total_count` and `effective_page`                  | Firm-scoped filtered, sorted, exact-counted queue with page size clamped to 50. |
| `get_pro_document_version_history` | JSON envelope                                                       | One ownership-scoped snapshot of every version for a document.                  |
| `set_pro_document_expiry`          | `document_id`, `client_id`, `expires_on`                            | Atomic document-owned expiry update and audit.                                  |
| `review_document_version`          | `document_id`, `client_id`, `fulfilled_request_id`, `review_status` | Atomic ownership-safe review, head/request transition, and audit.               |

All four functions are invoked by the server with service-role access, and the Document Center migrations revoke them from browser-facing database roles. Authorization is layered rather than identical in every RPC:

- the page and every action freshly require an active PRO session whose firm membership matches the resolved route slug;
- the data layer validates identifiers and filter inputs, then supplies the already-authorized firm ID to service-role reads;
- `list_pro_document_center` is service-role-only and scopes every request/document join to `p_tenant_id`, but it does not authenticate an actor itself;
- history validates the document/client/firm chain inside its RPC;
- review and expiry additionally enforce the active firm, active PRO actor, and their applicable locked ownership chains inside the mutation RPCs.

Signed URL access is not one of these RPCs; its data-layer query separately proves the version/document/client/firm chain before storage signing.

## Review invariants

Migration 0058 locks the version, document, client, and linked request while reviewing. It requires an active PRO actor in the active firm, validates all tenant/client relationships, and permits review only when the selected version is both `pending` and still the document's current head. The version update repeats the pending predicate; the approval update repeats the current-head predicate, keeping the check and mutation atomic under the row locks. A stale, already-reviewed, or superseded version raises `MD409` (`document_review_conflict`), which the data layer/server action expose only as a sanitized localized validation conflict.

Approved/rejected are the only accepted outcomes. A rejection requires a Unicode-trimmed note of at most 280 characters. Approval keeps the reviewed version as the document head and changes a pending linked request to fulfilled in the same transaction. Each successful review inserts one `tenant_audit_log` entry before returning.

## Dubai date semantics

The queue derives today's business date with `(now() at time zone 'Asia/Dubai')::date`. Request due timestamps are converted to Dubai dates before filtering. Expiring means the effective expiry is between today and today + 30 inclusive; overdue means a pending request due date is strictly earlier than today. Date filters are inclusive at both ends.
