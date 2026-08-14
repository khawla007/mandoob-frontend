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

Review updates the targeted version's review fields. Approval also moves `documents.current_version_id` and may fulfill the linked request, but it does not delete older versions.

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

All four functions are invoked by the server with service-role access. The Document Center migrations revoke them from browser-facing database roles. Because the service role bypasses row-level policies, every RPC and its calling data layer explicitly validates the full ownership chain.

## Review invariants

Migration 0058 locks the version, document, client, and linked request while reviewing. It requires an active PRO actor in the active firm, validates all tenant/client relationships, accepts only approved/rejected states, requires a Unicode-trimmed rejection note, and limits notes to 280 characters. Approval updates the document head and changes a pending linked request to fulfilled in the same transaction. Each successful review inserts one `tenant_audit_log` entry before returning.

## Dubai date semantics

The queue derives today's business date with `(now() at time zone 'Asia/Dubai')::date`. Request due timestamps are converted to Dubai dates before filtering. Expiring means the effective expiry is between today and today + 30 inclusive; overdue means a pending request due date is strictly earlier than today. Date filters are inclusive at both ends.
