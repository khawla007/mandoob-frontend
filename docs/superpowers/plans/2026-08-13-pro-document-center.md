# PRO Document Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PRO Documents placeholder with a secure, localized, queue-first firm-wide Document Center that reuses Mandoob’s existing document workflows.

**Architecture:** Authorize the route before service-role reads, then use one firm-scoped PostgreSQL RPC for filtered/exact-count queue pagination and independent guarded count queries for summary widgets. Keep mutations in authenticated server actions backed by ownership-chain checks in the document data layer, and render the workspace as a server component with small client islands for action dialogs and accessible feedback.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, Zod 4, next-intl, Tailwind CSS, shadcn/Radix UI, Node test runner, Playwright/axe.

---

## File map

**Create**

- `supabase/migrations/20260813100000_0057_pro_document_center.sql` — expiry column, document-type constraints, indexes, and the scoped queue RPC.
- `src/lib/data/pro-document-center.ts` — queue/count/history reads and document-expiry mutation.
- `src/lib/data/pro-document-center.test.ts` — DAL isolation, RPC, pagination, summary, history, and expiry tests.
- `src/lib/validation/pro-document-center.ts` — URL-state, focus, reject-note, and expiry schemas.
- `src/lib/validation/pro-document-center.test.ts` — parser boundary tests.
- `src/app/(tenant)/t/[tenant]/(pro)/documents/page-authorization.ts` — page-local PRO authorization.
- `src/app/(tenant)/t/[tenant]/(pro)/documents/page-logic.ts` — URL parsing and pagination-link generation.
- `src/app/(tenant)/t/[tenant]/(pro)/documents/page.test.ts` — route, UI, localization, and responsive contracts.
- `src/app/(tenant)/t/[tenant]/(pro)/documents/actions.ts` — firm-wide request, open, review, history, and expiry actions.
- `src/app/(tenant)/t/[tenant]/(pro)/documents/actions.test.ts` — fresh authorization and sanitized action-result tests.
- `src/app/(tenant)/t/[tenant]/(pro)/documents/loading.tsx` — layout-matched skeleton.
- `src/app/(tenant)/t/[tenant]/(pro)/documents/error.tsx` — localized recoverable error boundary.
- `src/components/pro/documents/DocumentSummaryGrid.tsx` — six native-link operational widgets.
- `src/components/pro/documents/DocumentFilters.tsx` — URL-driven desktop/mobile filters.
- `src/components/pro/documents/DocumentWorkQueue.tsx` — semantic table and pagination.
- `src/components/pro/documents/DocumentActions.tsx` — request/review/open/expiry client interactions.
- `src/components/pro/documents/VersionHistoryDialog.tsx` — accessible scoped history dialog.
- `src/lib/data/pro-document-center-migration.test.ts` — migration contract and mutation-safety checks.
- `docs/documentation/api/pro-document-center.md` — queue/action/security contracts.
- `docs/documentation/flows/pro-document-center.md` — request-to-upload-to-review and expiry ownership flow.

**Modify**

- `src/lib/validation/document.ts` and test — expand document types and require rejection notes.
- `src/lib/data/documents.ts` and test — strengthen signed URL and review authorization through the ownership chain.
- `src/app/(tenant)/t/[tenant]/(pro)/clients/[clientId]/documents/actions.ts` — revalidate the firm-wide route and return sanitized errors.
- `src/app/(tenant)/t/[tenant]/(pro)/documents/page.tsx` — replace `ComingSoon` with the workspace.
- `src/lib/db/database.types.ts` — add `expires_on` and the queue RPC signature.
- `src/messages/en.json` and `src/messages/ar.json` — complete localized Document Center copy.
- `src/app/globals.css` — scoped Signal Studio widget/queue styles, dark mode, RTL, responsive, and reduced-motion rules.
- `docs/documentation/database-schema.md` — expiry and expanded document-type contract.

### Task 1: Lock the migration contract

**Files:**

- Create: `src/lib/data/pro-document-center-migration.test.ts`
- Create: `supabase/migrations/20260813100000_0057_pro_document_center.sql`

- [ ] **Step 1: Write the failing migration contract tests**

Create tests that load the migration text and assert all of these exact properties:

```ts
test('document center migration adds nullable expiry and preserves every supported type', () => {
  assert.match(
    sql,
    /alter table public\.documents[\s\S]*add column if not exists expires_on date/iu,
  );
  for (const type of [
    'passport',
    'visa',
    'emirates_id',
    'trade_license',
    'ejari',
    'moa',
    'shareholder_id',
    'other',
    'aoa',
    'bank_reference_letter',
    'noc',
    'cv_resume',
    'office_lease',
    'medical_certificate',
    'insurance_policy',
  ])
    assert.match(sql, new RegExp(`'${type}'`, 'u'));
});

test('document queue RPC is invoker-safe, firm scoped, exact-counted, and stably paginated', () => {
  assert.match(sql, /create or replace function public\.list_pro_document_center/iu);
  assert.match(sql, /security invoker/iu);
  assert.match(sql, /p_tenant_id uuid/iu);
  assert.match(sql, /count\(\*\) over\(\)/iu);
  assert.match(sql, /order by[\s\S]*sort_key[\s\S]*entity_id/iu);
  assert.match(sql, /limit p_page_size offset/iu);
});
```

Add mutation tests that replace the tenant predicate, stable identifier tie-breaker, or `security invoker` phrase in memory and confirm the contract fails.

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
node --import tsx --conditions=react-server --test src/lib/data/pro-document-center-migration.test.ts
```

Expected: failure because `20260813100000_0057_pro_document_center.sql` does not exist.

- [ ] **Step 3: Implement the forward migration**

The migration must:

```sql
alter table public.documents
  add column if not exists expires_on date;

alter table public.documents drop constraint if exists documents_doc_type_check;
alter table public.documents add constraint documents_doc_type_check check (doc_type in (
  'passport','visa','emirates_id','trade_license','ejari','moa','shareholder_id','other',
  'aoa','bank_reference_letter','noc','cv_resume','office_lease','medical_certificate','insurance_policy'
));

alter table public.document_requests drop constraint if exists document_requests_doc_type_check;
alter table public.document_requests add constraint document_requests_doc_type_check check (doc_type in (
  'passport','visa','emirates_id','trade_license','ejari','moa','shareholder_id','other',
  'aoa','bank_reference_letter','noc','cv_resume','office_lease','medical_certificate','insurance_policy'
));

create index if not exists documents_tenant_expiry_idx
  on public.documents (tenant_id, expires_on, id) where expires_on is not null;
create index if not exists document_requests_tenant_status_due_idx
  on public.document_requests (tenant_id, status, due_at, id);
create index if not exists document_versions_document_created_stable_idx
  on public.document_versions (document_id, created_at desc, id desc);
```

Implement `public.list_pro_document_center(...)` as `language sql stable security invoker`, joining only rows whose client shares `p_tenant_id`. Build a `union all` of pending requests without a document head and document heads with their current version; compute effective expiry with `clients.license_expiry` for trade licenses, employee expiry fields for employee-linked visa/EID, otherwise `documents.expires_on`. Apply validated view/search/client/type/date inputs, `count(*) over()`, deterministic sort keys, `entity_id` tie-breaking, `limit least(greatest(p_page_size,1),50)`, and offset from the validated page.

- [ ] **Step 4: Run migration tests and confirm GREEN**

Run the command from Step 2. Expected: all migration contract and mutation tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260813100000_0057_pro_document_center.sql src/lib/data/pro-document-center-migration.test.ts
git commit -m "feat: add document center schema contract"
```

### Task 2: Define validation and URL-state behavior

**Files:**

- Create: `src/lib/validation/pro-document-center.ts`
- Create: `src/lib/validation/pro-document-center.test.ts`
- Modify: `src/lib/validation/document.ts`
- Modify: `src/lib/validation/document.test.ts`
- Create: `src/app/(tenant)/t/[tenant]/(pro)/documents/page-logic.ts`

- [ ] **Step 1: Write failing parser and schema tests**

Cover first-value handling for repeated parameters, invalid UUID/date/enum fallback, targeted request/document forcing page 1, page bounds, all seven views, all five sorts, expiry/due windows, filter-preserving hrefs, expanded document types, and mandatory trimmed rejection notes.

```ts
assert.deepEqual(parseDocumentCenterSearch({ view: ['rejected', 'approved'], page: ['2', '9'] }), {
  view: 'rejected',
  sort: 'urgency',
  page: 2,
});
assert.equal(parseDocumentCenterSearch({ document: DOCUMENT_ID, page: '8' }).page, 1);
assert.equal(documentReviewSchema.safeParse({ status: 'rejected', note: '   ' }).success, false);
assert.equal(docTypeSchema.safeParse('insurance_policy').success, true);
assert.equal(documentCenterHref('acme', parsed, 3), expectedHref);
```

- [ ] **Step 2: Run focused validation tests and confirm RED**

```bash
node --import tsx --conditions=react-server --test src/lib/validation/pro-document-center.test.ts src/lib/validation/document.test.ts
```

Expected: missing module/type failures and rejection-without-note assertion failure.

- [ ] **Step 3: Implement schemas and pure URL helpers**

Export these locked values and types:

```ts
export const documentCenterViews = [
  'all',
  'requested',
  'submitted',
  'approved',
  'rejected',
  'expiring',
  'overdue',
] as const;
export const documentCenterSorts = [
  'urgency',
  'newest',
  'oldest',
  'due_date',
  'expiry_date',
] as const;
export const documentCenterWindows = ['all', 'overdue', '7', '30', '90'] as const;
export const documentExpirySchema = z.object({
  document_id: z.string().uuid(),
  expires_on: z.union([z.iso.date(), z.literal('')]).transform((v) => v || null),
});
```

Expand `DOC_TYPES` with the seven PRD types. Refine `documentReviewSchema` so rejected reviews require `note.trim().min(1)` while approved reviews keep an optional note. Implement `first()`, `parseDocumentCenterSearch()`, and `documentCenterHref()` with `URLSearchParams`, including only non-default filters and preserving focus identifiers.

- [ ] **Step 4: Run tests and confirm GREEN**

Run Step 2. Expected: all parser and document validation tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/document.ts src/lib/validation/document.test.ts src/lib/validation/pro-document-center.ts src/lib/validation/pro-document-center.test.ts 'src/app/(tenant)/t/[tenant]/(pro)/documents/page-logic.ts'
git commit -m "feat: validate document center filters"
```

### Task 3: Implement scoped reads and expiry mutation

**Files:**

- Create: `src/lib/data/pro-document-center.ts`
- Create: `src/lib/data/pro-document-center.test.ts`
- Modify: `src/lib/db/database.types.ts`

- [ ] **Step 1: Write failing DAL tests**

Use the repository’s fetch-based Supabase test harness. Assert:

- `listProDocumentCenter()` calls only `rpc/list_pro_document_center` with validated `p_tenant_id`, page size 50, and returns the RPC total without in-memory slicing.
- Pages beyond row 1,000 retain the requested offset and exact total.
- Summary promises are independent and expose per-metric `{ ok, value } | { ok: false }` results.
- Version history first proves document/client/tenant ownership, then reads versions ordered `created_at desc,id desc`.
- Expiry update rejects a foreign document, rejects trade-license and employee visa/EID ownership, updates only document-owned expiry, and writes audit/auth events.
- Effective Dubai date boundaries include today through today+30 and exclude today+31.

```ts
const workspace = await listProDocumentCenter(TENANT_ID, { view: 'submitted', page: 21 });
assert.equal(workspace.pageSize, 50);
assert.equal(workspace.total, 1234);
assert.equal(capturedRpcBody.p_page, 21);
```

- [ ] **Step 2: Run the DAL test and confirm RED**

```bash
node --import tsx --conditions=react-server --test src/lib/data/pro-document-center.test.ts
```

Expected: missing `pro-document-center` module.

- [ ] **Step 3: Implement the DAL**

Define focused contracts:

```ts
export type DocumentCenterRow = {
  entityKind: 'request' | 'document';
  entityId: string;
  clientId: string;
  clientCompany: string;
  docType: DocType;
  label: string;
  requestStatus: 'pending' | 'fulfilled' | 'cancelled' | null;
  reviewStatus: 'pending' | 'approved' | 'rejected' | null;
  dueAt: string | null;
  expiresOn: string | null;
  versionId: string | null;
  uploadedAt: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  requesterName: string | null;
  reviewerName: string | null;
  totalCount: number;
};

export async function listProDocumentCenter(
  tenantId: string,
  input: DocumentCenterQuery,
): Promise<DocumentCenterWorkspace>;
export async function getDocumentCenterSummary(
  tenantId: string,
  todayDubai: string,
): Promise<DocumentCenterSummary>;
export async function listDocumentVersionHistory(
  tenantId: string,
  documentId: string,
): Promise<DocumentVersionHistoryEntry[]>;
export async function setDocumentExpiry(
  ctx: SetDocumentExpiryContext,
  input: DocumentExpiryInput,
): Promise<void>;
```

Map snake_case RPC rows explicitly, never return storage paths, calculate total from the first row’s `total_count`, and return zero when the RPC is empty. Use six separately caught exact-count queries or narrow RPC count calls so each summary result degrades independently.

Update generated-style database types with `documents.Row/Insert/Update.expires_on` and `Functions.list_pro_document_center.Args/Returns`.

- [ ] **Step 4: Run the DAL tests and confirm GREEN**

Run Step 2. Expected: all DAL tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/pro-document-center.ts src/lib/data/pro-document-center.test.ts src/lib/db/database.types.ts
git commit -m "feat: add firm document center data layer"
```

### Task 4: Harden existing signed URL and review workflows

**Files:**

- Modify: `src/lib/data/documents.test.ts`
- Modify: `src/lib/data/documents.ts`

- [ ] **Step 1: Add failing ownership-chain tests**

Assert that a matching `document_versions.tenant_id` is insufficient when its parent document or client is outside the tenant. Verify no storage signing or mutation occurs. Add a stale-version test so review can only mutate a version belonging to the scoped document chain, while preserving append-only history and request fulfillment on approval.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --import tsx --conditions=react-server --test src/lib/data/documents.test.ts
```

Expected: cross-chain signed URL/review tests fail because current code checks only `version.tenant_id`.

- [ ] **Step 3: Query through the full chain**

Change both reads to select and verify:

```ts
const { data: version } = await admin
  .from('document_versions')
  .select(
    `
  id, storage_path, document_id,
  document:documents!inner(id, tenant_id, client_id, client:clients!inner(id, tenant_id))
`,
  )
  .eq('id', versionId)
  .maybeSingle();
```

Require both document and client tenant IDs to equal the authorized tenant before signing or reviewing. Keep storage paths server-only, all audit semantics, and approval fulfillment behavior unchanged.

- [ ] **Step 4: Run tests and confirm GREEN**

Run Step 2. Expected: all existing and new document tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/documents.ts src/lib/data/documents.test.ts
git commit -m "fix: enforce document ownership chain"
```

### Task 5: Authorize the page and firm-wide actions

**Files:**

- Create: `src/app/(tenant)/t/[tenant]/(pro)/documents/page-authorization.ts`
- Create: `src/app/(tenant)/t/[tenant]/(pro)/documents/actions.ts`
- Create: `src/app/(tenant)/t/[tenant]/(pro)/documents/actions.test.ts`
- Modify: `src/app/(tenant)/t/[tenant]/(pro)/clients/[clientId]/documents/actions.ts`

- [ ] **Step 1: Write failing authorization/action tests**

Mirror the proven applications authorization dependency pattern. Cover unauthenticated/wrong-role propagation, missing slug, inactive firm, exact tenant mismatch before any service-role read, fresh authorization per action, foreign client/document/version rejection, required reject note, sanitized internal errors, and both route revalidations after success.

```ts
assert.deepEqual(calls, ['auth', 'tenant']);
assert.deepEqual(await rejectVersionAction('acme', VERSION_ID, { status: 'rejected', note: '' }), {
  ok: false,
  code: 'VALIDATION_FAILED',
  error: 'Invalid document action',
});
```

- [ ] **Step 2: Run action tests and confirm RED**

```bash
node --import tsx --conditions=react-server --test 'src/app/(tenant)/t/[tenant]/(pro)/documents/actions.test.ts'
```

Expected: missing authorization/actions modules.

- [ ] **Step 3: Implement authorization and typed actions**

Export `authorizeDocumentCenterRead()` with `requirePro`, `resolveTenant`, and `requireActive` dependencies. In actions, centralize `resolveAndAuthorize(slug)` and export:

```ts
requestDocumentCenterAction(slug, previousState, formData);
reviewDocumentCenterAction(slug, previousState, formData);
openDocumentVersionAction(slug, versionId);
loadVersionHistoryAction(slug, documentId);
setDocumentExpiryAction(slug, previousState, formData);
```

Return stable `ActionResult` codes and generic localized-message keys; log unexpected details only server-side. Revalidate `/t/${slug}/documents` plus `/t/${slug}/clients/${clientId}` after successful mutations. Update client-level actions to also revalidate the firm route and stop returning raw `ApiError.message`.

- [ ] **Step 4: Run tests and confirm GREEN**

Run Step 2. Expected: all action and authorization tests pass.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(tenant)/t/[tenant]/(pro)/documents' 'src/app/(tenant)/t/[tenant]/(pro)/clients/[clientId]/documents/actions.ts'
git commit -m "feat: add document center server actions"
```

### Task 6: Build the queue-first workspace under UI contract tests

**Files:**

- Create: `src/app/(tenant)/t/[tenant]/(pro)/documents/page.test.ts`
- Create: `src/components/pro/documents/DocumentSummaryGrid.tsx`
- Create: `src/components/pro/documents/DocumentFilters.tsx`
- Create: `src/components/pro/documents/DocumentWorkQueue.tsx`
- Create: `src/components/pro/documents/DocumentActions.tsx`
- Create: `src/components/pro/documents/VersionHistoryDialog.tsx`
- Modify: `src/app/(tenant)/t/[tenant]/(pro)/documents/page.tsx`

- [ ] **Step 1: Write failing page/UI contract tests**

Assert authorization precedes queue/count reads; route inputs are awaited; each summary widget is a native filtered link; one GET form owns search/filters/sort; reset is a link; the table has all required headers; pagination uses exact DAL total and preserves filters; focused rows expose `aria-current`; action components use `useActionState`, pending disables, dialogs have titles/descriptions/focusable close controls, feedback uses `aria-live`; locale formatters specify `Asia/Dubai`; no visible hardcoded English; and no `as never` casts.

- [ ] **Step 2: Run the page test and confirm RED**

```bash
node --import tsx --conditions=react-server --test 'src/app/(tenant)/t/[tenant]/(pro)/documents/page.test.ts'
```

Expected: placeholder page and missing components violate the contract.

- [ ] **Step 3: Implement server composition and focused client islands**

The page flow is:

```ts
const tenant = await authorizeDocumentCenterRead(slug, dependencies);
if (!tenant) notFound();
const query = parseDocumentCenterSearch(await searchParams);
const [workspace, summary, clients, t, locale] = await Promise.all([
  listProDocumentCenter(tenant.id, query),
  getDocumentCenterSummary(tenant.id, dubaiToday()),
  listClientsForTenant(tenant.id),
  getTranslations('proDocumentCenter'),
  getLocale(),
]);
```

Redirect pages beyond `ceil(total/50)` to the last valid filtered page. Render the approved layout A: compact heading/action, six 3×2/2×3/1-column widgets, applied filters, and full-width queue. Use semantic table markup inside `overflow-x-auto`; do not make rows clickable. Change primary action by row state and keep exact client/document/request drilldowns.

Use existing shadcn Dialog/Button/Input/Select primitives. Version history loads only after an authorized action and displays sequence, uploader, review metadata, note, MIME/size, and secure open. Reject uses a required textarea. Expiry action is disabled with explanatory text for externally owned dates.

- [ ] **Step 4: Run page tests and confirm GREEN**

Run Step 2. Expected: all page/UI contract tests pass.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(tenant)/t/[tenant]/(pro)/documents' src/components/pro/documents
git commit -m "feat: build PRO document center workspace"
```

### Task 7: Add loading, errors, localization, and Signal Studio styling

**Files:**

- Create: `src/app/(tenant)/t/[tenant]/(pro)/documents/loading.tsx`
- Create: `src/app/(tenant)/t/[tenant]/(pro)/documents/error.tsx`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json`
- Modify: `src/app/globals.css`
- Modify: `src/lib/i18n/messages.test.ts`

- [ ] **Step 1: Add failing i18n/state/style contract tests**

Require recursive key parity under `proDocumentCenter`; Arabic values for every new key; six distinct widget variants; scoped `.document-center` selectors; dark-mode counterparts; logical properties/RTL; 390px page containment; intentional queue-only overflow; `prefers-reduced-motion`; and loading/error components matching the route namespace.

- [ ] **Step 2: Run tests and confirm RED**

```bash
node --import tsx --conditions=react-server --test src/lib/i18n/messages.test.ts 'src/app/(tenant)/t/[tenant]/(pro)/documents/page.test.ts'
```

Expected: missing namespace/state/style assertions fail.

- [ ] **Step 3: Add complete English/Arabic messages and states**

Create matching `proDocumentCenter` objects with keys for title/subtitle, six summaries and their recovery text, views, filters, sorts, columns, statuses, actions, request/reject/expiry/history dialogs, pagination, loading, empty states, partial errors, page error, success feedback, file units, and all document-type labels. Arabic values must be Arabic, including long-form state/help copy.

Implement a server-safe skeleton with six summary placeholders plus filter/table rows. Implement a client error boundary with localized heading, description, and `reset()` button.

- [ ] **Step 4: Add scoped visual rules**

Use existing Signal Studio variables. Add `.document-center__summary--info|review|success|urgent|expiry|overdue`, each with one low-contrast pointer-inert pseudo-element motif. Add one restrained link shine, visible `:focus-visible`, warm dark surfaces, logical spacing, `min-width:0`, and:

```css
@media (prefers-reduced-motion: reduce) {
  .document-center__summary::after {
    animation: none;
    transition: none;
  }
}
.document-center__queue-scroll {
  max-width: 100%;
  overflow-x: auto;
}
```

- [ ] **Step 5: Run tests and confirm GREEN**

Run Step 2. Expected: i18n and page/state/style contracts pass.

- [ ] **Step 6: Commit**

```bash
git add src/messages/en.json src/messages/ar.json src/app/globals.css src/lib/i18n/messages.test.ts 'src/app/(tenant)/t/[tenant]/(pro)/documents/loading.tsx' 'src/app/(tenant)/t/[tenant]/(pro)/documents/error.tsx'
git commit -m "feat: localize and style document center"
```

### Task 8: Document the production contract

**Files:**

- Create: `docs/documentation/api/pro-document-center.md`
- Create: `docs/documentation/flows/pro-document-center.md`
- Modify: `docs/documentation/database-schema.md`

- [ ] **Step 1: Write the API and flow documentation**

Document RPC arguments/returns, exact-count pagination, allowed filters/sorts, authorization chain, action result codes, cache revalidation, private signed URL TTL, append-only versions, request notification fan-out, and sanitized errors. Document the request → customer upload → PRO review → fulfillment sequence and the approved expiry ownership table.

- [ ] **Step 2: Check documentation against implementation**

```bash
rg -n "list_pro_document_center|expires_on|Asia/Dubai|version.*document.*client.*tenant|Email.*WhatsApp.*SMS" docs/documentation
```

Expected: every contract appears in the new docs and schema reference.

- [ ] **Step 3: Commit**

```bash
git add docs/documentation/api/pro-document-center.md docs/documentation/flows/pro-document-center.md docs/documentation/database-schema.md
git commit -m "docs: document PRO document center"
```

### Task 9: Run focused and full automated verification

**Files:** all changed files.

- [ ] **Step 1: Run focused tests**

```bash
node --import tsx --conditions=react-server --test \
  src/lib/data/pro-document-center-migration.test.ts \
  src/lib/validation/pro-document-center.test.ts \
  src/lib/validation/document.test.ts \
  src/lib/data/pro-document-center.test.ts \
  src/lib/data/documents.test.ts \
  'src/app/(tenant)/t/[tenant]/(pro)/documents/actions.test.ts' \
  'src/app/(tenant)/t/[tenant]/(pro)/documents/page.test.ts' \
  src/lib/i18n/messages.test.ts
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 2: Run the complete explicit source-test enumeration**

```bash
node --import tsx --conditions=react-server --test $(find src -name '*.test.ts' -print | sort)
```

Record the test count. If `npm test` passes its quoted glob literally on Node 20, record that known tooling defect and retain this explicit command as the authoritative result.

- [ ] **Step 3: Run static and production gates**

```bash
npx tsc --noEmit
npm run lint
npx prettier --check $(git diff --name-only origin/main...HEAD | rg '\.(ts|tsx|css|json|md|sql)$')
git diff --check origin/main...HEAD
npm run build
```

Expected: all commands exit 0. Existing warnings must be identified as pre-existing; new warnings are fixed.

### Task 10: Perform authenticated browser acceptance and capture evidence

**Files:**

- Create evidence under `../Reports/launch-gate-evidence/2026-08-13/pro-document-center/`.

- [ ] **Step 1: Confirm the saved PRO browser session**

Use only a user-provided saved authenticated session. If none exists, stop this task and request one; do not place credentials in code, commands, or shell history.

- [ ] **Step 2: Verify viewport, locale, and theme matrix**

Check 1440×900, 1024×768, 768×1024, and 390×844 in English and Arabic, light and dark. Save screenshots with deterministic names. Confirm summary drilldowns, filter/pagination persistence, reset, request, approve, reject, open, client link, version history, exact focus, RTL ordering, keyboard focus, and no page overflow.

- [ ] **Step 3: Run browser diagnostics**

Capture console output and authenticated axe results. Expected: no application console errors and no Critical or Serious axe violations.

- [ ] **Step 4: Write the evidence manifest**

Record route, session label (not credentials), commit SHA, viewport, locale, theme, screenshot names, action results, console result, axe result, and any non-blocking observations.

### Task 11: Self-review, fix findings, and deliver main

**Files:** all changes and evidence.

- [ ] **Step 1: Review the complete diff**

```bash
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --check origin/main...HEAD
```

Classify findings as Critical, Important, or Minor. Fix every Critical and Important finding with a failing regression test first, rerun the focused and affected full gates, and record deferred Minor findings in the evidence manifest.

- [ ] **Step 2: Commit final fixes and evidence**

```bash
git add -u
git add docs src supabase
git commit -m "feat: deliver PRO document center"
```

Evidence remains in the canonical workspace-level `Reports` directory, which is outside the nested frontend Git repository. If no final repository changes remain, do not create an empty commit.

- [ ] **Step 3: Verify and push main**

```bash
git status --short
git branch --show-current
git log --oneline origin/main..HEAD
git push origin main
```

Expected: clean worktree, branch `main`, push succeeds, and `origin/main` contains the design plus implementation commits.
