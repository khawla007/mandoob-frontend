# PRO Dashboard Signal Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PRO analytics overview with the approved Signal Studio operations dashboard backed entirely by tenant-scoped service-case, renewal, document, and finance data.

**Architecture:** Add a small `service_cases` foundation because the repository has no registration/application entity, then aggregate it with existing renewals, document requests, clients, invoices, and payments in one server-only dashboard data layer. Keep chart and interaction components client-side, keep authorization and metric calculation server-side, and let every widget drill into a filtered working page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres/RLS, next-intl, Tailwind CSS 4, shadcn/ui, Recharts 3, Node test runner, Playwright/axe.

---

## File map

**Create**

- `supabase/migrations/20260811090000_0047_service_cases.sql` — tenant-scoped application/case records and RLS.
- `src/lib/validation/service-case.ts` — create/update/filter schemas.
- `src/lib/validation/service-case.test.ts` — validation boundaries.
- `src/lib/data/service-cases.ts` — case queries and mutations.
- `src/lib/data/service-cases.test.ts` — pure mapping, ranking, and tenant-isolation tests.
- `src/app/(tenant)/t/[tenant]/(pro)/applications/page.tsx` — filtered working list.
- `src/app/(tenant)/t/[tenant]/(pro)/applications/actions.ts` — create and status-change actions.
- `src/components/pro/applications/ApplicationsTable.tsx` — accessible application list.
- `src/lib/data/pro-dashboard.ts` — dashboard contract, pure aggregation, and server loader.
- `src/lib/data/pro-dashboard.test.ts` — metric, score, ordering, currency, and isolation tests.
- `src/components/pro/dashboard/SignalHero.tsx` — priority summary and explained health score.
- `src/components/pro/dashboard/SignalKpis.tsx` — four gradient metric cards.
- `src/components/pro/dashboard/CaseVelocityChart.tsx` — opened/completed area chart.
- `src/components/pro/dashboard/ActionDeck.tsx` — ranked operational actions.
- `src/components/pro/dashboard/DeadlineHeatmap.tsx` — desktop heatmap and mobile/list fallback.
- `src/components/pro/dashboard/CollectionsWaterfall.tsx` — billed/paid/due/overdue chart.
- `src/components/pro/dashboard/RenewalStreams.tsx` — 7/30/60/90-day directional bars.
- `src/components/pro/dashboard/TeamSignal.tsx` — permission-aware workload view.
- `src/components/pro/dashboard/dashboard-links.ts` — canonical filtered destinations.
- `src/components/pro/dashboard/dashboard-links.test.ts` — encoded drill-down links.
- `tests/a11y/pro-dashboard.spec.ts` — light/dark, keyboard, and mobile accessibility checks.

**Modify**

- `src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.tsx` — compose the new server-loaded dashboard.
- `src/lib/shell/nav-pro.ts` — add Applications and rename Overview to Command Center.
- `src/lib/shell/nav-pro.test.ts` — lock route and label behavior.
- `src/messages/en.json` — English dashboard/application copy.
- `src/messages/ar.json` — Arabic dashboard/application copy.
- `src/app/globals.css` — authenticated Signal Studio semantic tokens and geometric motif.

## Task 1: Create the service-case database foundation

**Files:**

- Create: `supabase/migrations/20260811090000_0047_service_cases.sql`

- [ ] **Step 1: Write the migration with constrained lifecycle fields**

```sql
create table if not exists public.service_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  service_type text not null check (char_length(trim(service_type)) between 2 and 80),
  status text not null default 'draft' check (status in (
    'draft','documents_pending','ready_to_submit','submitted',
    'authority_review','approved','completed','cancelled'
  )),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  sla_due_at timestamptz,
  blocked_reason text check (blocked_reason is null or char_length(trim(blocked_reason)) between 2 and 500),
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create index service_cases_tenant_status_idx
  on public.service_cases(tenant_id, status, created_at desc);
create index service_cases_tenant_sla_idx
  on public.service_cases(tenant_id, sla_due_at)
  where status not in ('completed','cancelled');
create index service_cases_assignee_idx
  on public.service_cases(tenant_id, assigned_to, status);

create trigger service_cases_set_updated_at before update on public.service_cases
  for each row execute function public.set_updated_at();

alter table public.service_cases enable row level security;
create policy service_cases_super_admin_read on public.service_cases for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
create policy service_cases_tenant_read on public.service_cases for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid);
create policy service_cases_pro_write on public.service_cases for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );
```

- [ ] **Step 2: Validate the migration locally**

Run: `npx supabase db reset`

Expected: all migrations apply, including `0047_service_cases`, without SQL or policy errors.

- [ ] **Step 3: Commit the schema**

```bash
git add supabase/migrations/20260811090000_0047_service_cases.sql
git commit -m "feat: add tenant service cases"
```

## Task 2: Add case validation and pure lifecycle rules

**Files:**

- Create: `src/lib/validation/service-case.ts`
- Create: `src/lib/validation/service-case.test.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServiceCaseSchema, updateServiceCaseSchema } from './service-case';

test('create case requires tenant-owned client data and a useful title', () => {
  assert.equal(
    createServiceCaseSchema.safeParse({ client_id: '', title: 'x', service_type: '' }).success,
    false,
  );
  assert.equal(
    createServiceCaseSchema.safeParse({
      client_id: '3f3123e1-4265-40b0-91c3-f595c1e36e7a',
      title: 'Mainland trade licence',
      service_type: 'company_registration',
      priority: 'high',
    }).success,
    true,
  );
});

test('completed cases require completed_at', () => {
  assert.equal(updateServiceCaseSchema.safeParse({ status: 'completed' }).success, false);
  assert.equal(
    updateServiceCaseSchema.safeParse({
      status: 'completed',
      completed_at: '2026-08-11T10:00:00.000Z',
    }).success,
    true,
  );
});
```

- [ ] **Step 2: Run the test to verify red**

Run: `node --import tsx --conditions=react-server --test src/lib/validation/service-case.test.ts`

Expected: FAIL because `service-case.ts` does not exist.

- [ ] **Step 3: Implement the schemas**

```ts
import { z } from 'zod';

export const serviceCaseStatuses = [
  'draft',
  'documents_pending',
  'ready_to_submit',
  'submitted',
  'authority_review',
  'approved',
  'completed',
  'cancelled',
] as const;

export const createServiceCaseSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  service_type: z.string().trim().min(2).max(80),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assigned_to: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime().nullable().optional(),
  sla_due_at: z.string().datetime().nullable().optional(),
});

export const updateServiceCaseSchema = z
  .object({
    status: z.enum(serviceCaseStatuses).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    due_at: z.string().datetime().nullable().optional(),
    sla_due_at: z.string().datetime().nullable().optional(),
    blocked_reason: z.string().trim().min(2).max(500).nullable().optional(),
    completed_at: z.string().datetime().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'completed' && !value.completed_at) {
      ctx.addIssue({ code: 'custom', path: ['completed_at'], message: 'Required when completed' });
    }
  });
```

- [ ] **Step 4: Run the test to verify green**

Run: `node --import tsx --conditions=react-server --test src/lib/validation/service-case.test.ts`

Expected: 2 tests pass.

- [ ] **Step 5: Commit validation**

```bash
git add src/lib/validation/service-case.ts src/lib/validation/service-case.test.ts
git commit -m "feat: validate service case lifecycle"
```

## Task 3: Build the tenant-scoped application working page

**Files:**

- Create: `src/lib/data/service-cases.ts`
- Create: `src/lib/data/service-cases.test.ts`
- Create: `src/app/(tenant)/t/[tenant]/(pro)/applications/page.tsx`
- Create: `src/app/(tenant)/t/[tenant]/(pro)/applications/actions.ts`
- Create: `src/components/pro/applications/ApplicationsTable.tsx`
- Modify: `src/lib/shell/nav-pro.ts`
- Modify: `src/lib/shell/nav-pro.test.ts`

- [ ] **Step 1: Write failing mapper and priority-order tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankServiceCases, toServiceCase } from './service-cases';

test('maps database fields without losing tenant ownership', () => {
  const row = toServiceCase({
    id: 'c1',
    tenant_id: 't1',
    client_id: 'client1',
    title: 'Licence',
    service_type: 'registration',
    status: 'documents_pending',
    priority: 'high',
    assigned_to: null,
    due_at: null,
    sla_due_at: '2026-08-11T12:00:00Z',
    blocked_reason: 'Passport missing',
    completed_at: null,
    created_by: null,
    created_at: '2026-08-10T08:00:00Z',
    updated_at: '2026-08-10T08:00:00Z',
  });
  assert.equal(row.tenantId, 't1');
  assert.equal(row.blockedReason, 'Passport missing');
});

test('ranks breached SLA before later urgent and high-priority cases', () => {
  const rows = [
    { id: 'later', priority: 'urgent', slaDueAt: '2026-08-12T12:00:00Z' },
    { id: 'breached', priority: 'normal', slaDueAt: '2026-08-11T08:00:00Z' },
  ];
  assert.deepEqual(
    rankServiceCases(rows, new Date('2026-08-11T10:00:00Z')).map((x) => x.id),
    ['breached', 'later'],
  );
});
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `node --import tsx --conditions=react-server --test src/lib/data/service-cases.test.ts`

Expected: FAIL because the data module does not exist.

- [ ] **Step 3: Implement the data API**

Define and export these exact signatures:

```ts
export type ServiceCaseStatus = (typeof serviceCaseStatuses)[number];
export type ServiceCase = {
  id: string;
  tenantId: string;
  clientId: string;
  clientName: string;
  title: string;
  serviceType: string;
  status: ServiceCaseStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo: string | null;
  ownerName: string | null;
  dueAt: string | null;
  slaDueAt: string | null;
  blockedReason: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toServiceCase(row: ServiceCaseDbRow): Omit<ServiceCase, 'clientName' | 'ownerName'>;
export function rankServiceCases<
  T extends { id: string; priority: string; slaDueAt: string | null },
>(rows: T[], now?: Date): T[];
export async function listServiceCases(
  tenantId: string,
  filters?: {
    status?: ServiceCaseStatus[];
    assignedTo?: string;
    clientId?: string;
  },
): Promise<ServiceCase[]>;
export async function createServiceCase(
  ctx: { tenantId: string; actorId: string; role: 'pro' },
  input: CreateServiceCaseInput,
): Promise<{ id: string }>;
export async function updateServiceCase(
  ctx: { tenantId: string; actorId: string; role: 'pro' },
  id: string,
  input: UpdateServiceCaseInput,
): Promise<void>;
```

Before insert or update, verify the client and assignee belong to `ctx.tenantId`. Every query must include `.eq('tenant_id', tenantId)`. Write `tenant_audit_log` entries named `service_case_created` and `service_case_updated`.

- [ ] **Step 4: Add the applications route and table**

The server page must resolve the tenant, load filters from `searchParams`, call `listServiceCases`, and render `ApplicationsTable`. The table columns are client, service, status, owner, SLA/due time, and direct action. Use links with this stable filter contract:

```text
/t/{tenant}/applications?status=documents_pending,submitted&owner={profileId}
```

The actions file must resolve the authenticated PRO session and tenant before calling the data mutations, then revalidate both `/t/{slug}/applications` and `/t/{slug}/dashboard`.

- [ ] **Step 5: Add Applications navigation and test it**

Insert after Clients:

```ts
{
  labelKey: 'applications',
  labelFallback: 'Applications',
  href: `${base}/applications`,
  icon: ClipboardList,
}
```

Update `nav-pro.test.ts` to assert exactly one `/t/acme/applications` item and retain all existing routes.

- [ ] **Step 6: Run focused checks**

Run: `node --import tsx --conditions=react-server --test src/lib/data/service-cases.test.ts src/lib/shell/nav-pro.test.ts`

Expected: all service-case and navigation tests pass.

- [ ] **Step 7: Commit the application foundation**

```bash
git add src/lib/data/service-cases.ts src/lib/data/service-cases.test.ts src/app/'(tenant)'/t/'[tenant]'/'(pro)'/applications src/components/pro/applications src/lib/shell/nav-pro.ts src/lib/shell/nav-pro.test.ts
git commit -m "feat: add PRO service case workspace"
```

## Task 4: Define and test the dashboard aggregation contract

**Files:**

- Create: `src/lib/data/pro-dashboard.ts`
- Create: `src/lib/data/pro-dashboard.test.ts`
- Modify: `src/lib/data/tenant-metrics.ts`

- [ ] **Step 1: Write failing aggregation tests**

Use fixed `now = 2026-08-11T10:00:00Z` and two tenants. Assert:

```ts
assert.equal(result.kpis.activeClients, 2);
assert.equal(result.kpis.openCases, 3);
assert.equal(result.kpis.renewalsDue30d, 2);
assert.equal(result.finance.overdueMinor, 7_300);
assert.deepEqual(
  result.actionDeck.map((item) => item.kind),
  ['case', 'renewal', 'document', 'invoice'],
);
assert.equal(result.caseVelocity[0].opened, 2);
assert.equal(result.caseVelocity[0].completed, 1);
assert.equal(result.renewalStreams.license.d7, 1);
assert.ok(result.health.score >= 0 && result.health.score <= 100);
assert.equal(
  result.team.some((member) => member.tenantId === 'other-tenant'),
  false,
);
```

- [ ] **Step 2: Confirm the tests fail**

Run: `node --import tsx --conditions=react-server --test src/lib/data/pro-dashboard.test.ts`

Expected: FAIL because `pro-dashboard.ts` does not exist.

- [ ] **Step 3: Implement the public dashboard types**

```ts
export type ProDashboardData = {
  generatedAt: string;
  kpis: {
    activeClients: number;
    openCases: number;
    renewalsDue30d: number;
    renewalsDue7d: number;
    collectedMinor: number;
    currency: string;
    collectionRate: number;
  };
  health: {
    score: number;
    overdueRatio: number;
    slaCompletionRate: number;
    blockedRatio: number;
    reminderRate: number;
    workloadBalance: number;
  };
  caseVelocity: Array<{ date: string; opened: number; completed: number }>;
  actionDeck: Array<{
    id: string;
    kind: 'case' | 'renewal' | 'document' | 'invoice';
    title: string;
    detail: string;
    clientName: string;
    ownerName: string | null;
    deadline: string | null;
    urgency: 'breached' | 'urgent' | 'soon' | 'normal';
    href: string;
  }>;
  deadlineIntensity: Array<{ date: string; morning: number; afternoon: number }>;
  finance: {
    billedMinor: number;
    paidMinor: number;
    dueSoonMinor: number;
    overdueMinor: number;
    currency: string;
  };
  renewalStreams: Record<
    'license' | 'visa' | 'eid' | 'ejari',
    { d7: number; d30: number; d60: number; d90: number }
  >;
  team: Array<{
    profileId: string;
    tenantId: string;
    name: string;
    activeCases: number;
    capacityPercent: number;
  }>;
};
```

Implement `calculateProDashboard(input, now)` as a pure exported function. Filter every input collection by `tenantId` before aggregation. Clamp the health score to 0–100 and return zero-filled chart dates and empty arrays rather than throwing for empty data.

- [ ] **Step 4: Implement the server loader**

```ts
export async function getProDashboardData(
  tenantId: string,
  days: 7 | 30 | 90 = 30,
): Promise<ProDashboardData>;
```

Load `clients`, `service_cases`, `profiles`, `renewals`, `document_requests`, `documents/currentVersion`, `invoices`, `payments`, and `refunds` in parallel with explicit `.eq('tenant_id', tenantId)`. Reuse `calculateProFinanceDashboard` for money rules and the renewal helpers for day buckets. Throw named query errors; the page will isolate widget failures with error boundaries in Task 7.

- [ ] **Step 5: Remove obsolete PRO metric exports**

Delete `ProDashboardKpiKey`, `ProDashboardMetric`, and `getProDashboardMetrics` from `tenant-metrics.ts` after the page no longer imports them. Keep admin/team login metrics unchanged.

- [ ] **Step 6: Run the aggregation tests**

Run: `node --import tsx --conditions=react-server --test src/lib/data/pro-dashboard.test.ts`

Expected: all aggregation, empty-state, mixed-currency, ranking, and cross-tenant tests pass.

- [ ] **Step 7: Commit dashboard data**

```bash
git add src/lib/data/pro-dashboard.ts src/lib/data/pro-dashboard.test.ts src/lib/data/tenant-metrics.ts
git commit -m "feat: aggregate PRO operations dashboard"
```

## Task 5: Build the Signal Studio visual components

**Files:**

- Create: all files under `src/components/pro/dashboard/` listed in the file map.
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add authenticated Signal Studio tokens**

Add semantic variables to both `:root` and `.dark`, reusing `--brand-accent`:

```css
--signal-urgent: oklch(0.58 0.19 28);
--signal-warning: oklch(0.66 0.14 76);
--signal-info: oklch(0.55 0.09 220);
--signal-success: oklch(0.53 0.12 155);
--signal-orange-soft: color-mix(in oklch, var(--brand-accent) 11%, var(--card));
--signal-grid: repeating-linear-gradient(
  135deg,
  transparent 0 12px,
  color-mix(in oklch, var(--brand-accent) 8%, transparent) 12px 13px
);
```

Dark mode uses the same semantic hues with higher lightness and mixes soft surfaces into `--card`. Do not change public `.site-public` values.

- [ ] **Step 2: Implement canonical drill-down links with tests**

```ts
export function dashboardHref(
  slug: string,
  target: 'applications' | 'renewals' | 'documents' | 'payments',
  params: Record<string, string>,
): string {
  const query = new URLSearchParams(params);
  return `/t/${encodeURIComponent(slug)}/${target}?${query.toString()}`;
}
```

Test spaces, commas, UUID owner filters, and the four destinations. Run:

`node --import tsx --conditions=react-server --test src/components/pro/dashboard/dashboard-links.test.ts`

Expected: all link tests pass.

- [ ] **Step 3: Implement the hero and KPI cards**

`SignalHero` accepts `health`, `actionCount`, `caseVelocity`, and `tenantSlug`. Its gradient is CSS-only and its mini chart has an accessible summary. The health-score trigger opens a shadcn `Dialog` listing all five score inputs.

`SignalKpis` accepts `kpis` and renders exactly four linked cards. Use `font-mono tabular-nums`, semantic helper text, `focus-visible:ring-2`, and no animation when `prefers-reduced-motion` is set.

- [ ] **Step 4: Implement the three chart types**

- `CaseVelocityChart`: Recharts `AreaChart`, two series, 7/30/90 range links, tooltip, visible legend, text summary.
- `CollectionsWaterfall`: Recharts `BarChart`, four bars using raw minor values and formatted labels; hide the card when `canViewFinance` is false.
- `DeadlineHeatmap`: semantic button grid on desktop; ordered deadline list below `md`; each cell exposes date, period, count, and event types in its accessible name.

- [ ] **Step 5: Implement action, renewal, and team widgets**

- `ActionDeck` renders at most five actions, preserving `href`, urgency text, owner, and deadline.
- `RenewalStreams` renders four arrow-ended CSS bars and text totals for 7/30/60/90 days.
- `TeamSignal` renders active cases and capacity; never presents completion count as a ranking.

All widgets must support data, loading-shaped skeleton, empty, and local error states.

- [ ] **Step 6: Run TypeScript and lint**

Run: `npx tsc --noEmit`

Expected: zero TypeScript errors.

Run: `npm run lint`

Expected: zero new errors or warnings in dashboard files.

- [ ] **Step 7: Commit the visual system**

```bash
git add src/components/pro/dashboard src/app/globals.css
git commit -m "feat: build Signal Studio dashboard widgets"
```

## Task 6: Compose the server dashboard and translations

**Files:**

- Modify: `src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.tsx`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json`

- [ ] **Step 1: Replace the old dashboard data calls**

Resolve the tenant and requested `range`, then call:

```ts
const range =
  searchParams.range === '7' || searchParams.range === '90'
    ? (Number(searchParams.range) as 7 | 90)
    : 30;
const dashboard = await getProDashboardData(tenant.id, range);
```

Remove `SignupsChart`, `RecentLoginsTable`, and `getProDashboardMetrics` from this route. Do not delete shared admin components.

- [ ] **Step 2: Compose widgets in the approved priority order**

Render:

1. page title and filters;
2. Signal hero;
3. four KPI cards;
4. Case Velocity with Collections Waterfall;
5. Action Deck;
6. Deadline Heatmap with Renewal Streams;
7. Team Signal for managers.

At `md` and below, render Action Deck immediately after KPI cards and before charts.

- [ ] **Step 3: Add complete English and Arabic messages**

Create the same keys in both locale files under `pro.dashboard.signalStudio`: `title`, `subtitle`, `prioritySignals`, `operationsScore`, `openActionDeck`, `assignWork`, `activeClients`, `openCases`, `renewalsDue`, `collections`, `caseVelocity`, `opened`, `completed`, `deadlineIntensity`, `collectionsWaterfall`, `renewalStreams`, `teamSignal`, `empty`, `retry`, `range7`, `range30`, and `range90`.

- [ ] **Step 4: Verify locale parity**

Run: `node --import tsx --conditions=react-server --test src/lib/i18n/messages.test.ts`

Expected: English and Arabic key parity passes.

- [ ] **Step 5: Commit route integration**

```bash
git add src/app/'(tenant)'/t/'[tenant]'/'(pro)'/dashboard/page.tsx src/messages/en.json src/messages/ar.json
git commit -m "feat: launch PRO Signal Studio dashboard"
```

## Task 7: Verify behavior, accessibility, and responsiveness

**Files:**

- Create: `tests/a11y/pro-dashboard.spec.ts`

- [ ] **Step 1: Add Playwright accessibility coverage**

The test logs in with the existing PRO fixture and asserts:

```ts
await expect(
  page.getByRole('heading', { name: /command center|operational overview/i }),
).toBeVisible();
await expect(page.getByRole('link', { name: /open action deck/i })).toHaveAttribute(
  'href',
  /applications/,
);
await expect(page.locator('[data-testid="case-velocity"]')).toHaveAttribute('aria-label');
await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
```

Run axe with no serious or critical violations in light and dark themes, then repeat at 390×844 and 768×1024.

- [ ] **Step 2: Run the focused data and UI checks**

Run:

```bash
node --import tsx --conditions=react-server --test \
  src/lib/validation/service-case.test.ts \
  src/lib/data/service-cases.test.ts \
  src/lib/data/pro-dashboard.test.ts \
  src/components/pro/dashboard/dashboard-links.test.ts \
  src/lib/shell/nav-pro.test.ts \
  src/lib/i18n/messages.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 3: Run the complete verification suite**

Run: `npm test`

Expected: all Node tests pass.

Run: `npm run lint`

Expected: no errors and no new warnings.

Run: `npm run build`

Expected: production build completes successfully.

Run: `npx playwright test tests/a11y/pro-dashboard.spec.ts`

Expected: desktop, tablet, mobile, light, and dark checks pass with no serious or critical axe findings.

- [ ] **Step 4: Perform visual verification**

Inspect `/t/{fixture-tenant}/dashboard` at 1440×900, 1024×768, 768×1024, and 390×844 in both themes. Confirm hero text contrast, visible focus, chart tooltips, mobile deadline list, correct currency, empty states, and no clipped controls.

- [ ] **Step 5: Commit verification coverage**

```bash
git add tests/a11y/pro-dashboard.spec.ts
git commit -m "test: verify PRO dashboard accessibility"
```

## Task 8: Update product documentation

**Files:**

- Modify: `docs/superpowers/specs/2026-08-11-pro-dashboard-signal-studio-design.md`
- Create: `docs/documentation/roles/pro-dashboard.md`

- [ ] **Step 1: Document the shipped dashboard**

Include widget definitions, score formula inputs, permissions, drill-down routes, query ranges, semantic colors, empty/error behavior, and the service-case lifecycle. Mark the design spec status as `Implemented` only after Task 7 passes.

- [ ] **Step 2: Check documentation formatting**

Run: `npx prettier --check docs/superpowers/specs/2026-08-11-pro-dashboard-signal-studio-design.md docs/documentation/roles/pro-dashboard.md`

Expected: both files pass formatting.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/superpowers/specs/2026-08-11-pro-dashboard-signal-studio-design.md docs/documentation/roles/pro-dashboard.md
git commit -m "docs: document PRO operations dashboard"
```
