# PRO Document Center Flows

## Request to upload to review

1. A signed-in PRO opens `/t/{pro-slug}/documents`. The server freshly verifies the PRO role, live assignment, slug-to-tenant match, and active tenant before any service-role read.
2. The PRO chooses one of the 15 supported document types for the assigned company, supplies a label, and may add a Dubai-calendar due date and notes.
3. The server action repeats authorization, validates the form, derives the company from the live assignment, and creates a pending `document_requests` row. It then attempts tenant audit and auth-event telemetry; telemetry failures are safely logged without rolling back the request.
4. Notification delivery is attempted after creation. Current behavior requires a linked customer profile and auth-user email, awaits Email first, and only after a successful email enqueue attempts WhatsApp and then SMS when a phone exists. The latter two attempts are best-effort. This email-first dependency is a known sequencing limitation, not independent channel fan-out; notification failure does not roll back the request or expose internals to the user.
5. The customer opens the document portal and uploads a permitted, scanned file. Upload creates a new `document_versions` row and points the document head at that version; earlier versions remain in history.
6. The queue now shows the document as submitted/pending review. The PRO can open its short-lived signed URL only after the server proves `version -> document -> company -> tenant` and validates the generated storage key.
7. The PRO approves or rejects the version. Rejection requires a trimmed note. The atomic review RPC rechecks the active tenant/actor, locks and proves the complete ownership chain, updates the selected version, and writes audit data.
8. Approval points the document head at the reviewed version and fulfills a linked pending request in the same transaction. Rejection leaves the request unfulfilled so a corrected upload can be added as another version.
9. Successful mutations invalidate both the Document Center and Assigned Company workspace.

## Queue and focused navigation

The queue is a company-scoped union of outstanding requests without a document head and document heads with their current version. Filters and focus values are URL state, enabling Document Center widgets and internal drill-downs to link to an exact operational view.

- Views: all, requested, submitted, approved, rejected, expiring, and overdue.
- Sorts: urgency, newest, oldest, due date, and expiry date.
- Filters: document type, search, inclusive date range, and preset window. The assigned company is applied server-side. Presets are `all`, `overdue`, `7`, `30`, and `90`; any non-`all` preset replaces custom dates. `overdue` maps through Dubai yesterday, while numeric presets map from Dubai today through the selected day count. Bounds apply to due dates for `requested`/`overdue` and expiry dates for every other view.
- Focus: exact request or document UUID; focused navigation always begins on page 1.
- Pagination: 50 rows maximum, exact filtered total, stable entity tie-breakers, and a database-clamped `effective_page`.

The six status widgets issue independent counts. A failed metric reports its own unavailable state while the other metrics and queue remain usable.

## Version history

Opening history repeats fresh action authorization, proves `document -> company -> tenant`, and retrieves a single database snapshot ordered newest-first by creation time and UUID. The response includes every preserved version, its sequence number, uploader, reviewer, review outcome/note, size, MIME type, and whether it is the current head. The server rejects a malformed or internally inconsistent snapshot instead of returning partial history.

Re-upload does not replace or delete an earlier version row. Review changes the selected version's review fields; approval may change the document's current-version pointer. This separation preserves the version trail while allowing the head to represent the active upload.

## Expiry ownership

Document Center calculates all due/expiry windows in `Asia/Dubai`. Today through day 30 is expiring; a request date before today is overdue.

Expiry is edited at its authoritative owner:

```text
trade licence --------------------> company_profile.license_expiry
employee-linked visa -------------> employee.visa_expiry
employee-linked Emirates ID ------> employee.eid_expiry
all other document expiry --------> documents.expires_on
```

The first three values are displayed in Document Center but cannot be changed there. Their company/employee workflows own the update. For a document-owned expiry, the action repeats fresh authorization and calls one atomic RPC that verifies the active PRO, tenant, document, company, and any employee link; updates the nullable date; and inserts tenant audit data. A race or ownership mismatch fails without a partial update.

## Failure and disclosure behavior

- Invalid URL or form input falls back safely or returns a localized validation result.
- Cross-company and broken ownership chains do not reveal the target record.
- Inactive tenants cannot read or mutate the workspace.
- Storage URLs are never persisted in UI state beyond the returned short-lived open result.
- Expected failures return stable codes and message keys; unexpected details are confined to sanitized server logs.
- Review and expiry database changes are atomic with their tenant audit entries. Best-effort auth telemetry and request notifications do not roll back an already successful primary operation.
