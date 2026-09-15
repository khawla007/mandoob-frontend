# PRO Dashboard Signal Studio Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Git-backed Design B — Signal Studio presentation on the current one-PRO–one-company dashboard without regressing Phase 1/2 behavior.

**Architecture:** Keep current authorization, assigned-Company reads, dashboard data contracts, URLs, and operational widgets. Add a Company-aware hero derived from `4fbd79c`, reduce the decision row to four non-duplicated Company signals, and selectively recover Design B layout/CSS around current components.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Tailwind CSS, Recharts, Node test runner, ESLint, Prettier, agent-browser.

---

## File map

- Create `src/components/pro/dashboard/CompanySignalHero.tsx`: Company-aware Design B hero.
- Modify `src/components/pro/dashboard/index.ts`: export the hero contract.
- Modify `src/components/pro/dashboard/CompanySummaryDeck.tsx`: four Design B decision instruments.
- Modify `src/components/pro/dashboard/dashboard-widgets.test.ts`: Company-only widget contracts.
- Modify `src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.tsx`: restored composition.
- Modify `src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.test.ts`: visual and semantic source contracts.
- Modify dashboard `loading.tsx` and `error.tsx`: shape-matched states.
- Modify `src/app/globals.css`: recovered Signal Studio visual rules.
- Modify `src/messages/en.json` and `src/messages/ar.json`: hero copy.
- Create `Reports/launch-gate-evidence/2026-09-15/pro-dashboard-signal-studio-restoration/verification.md` and browser screenshots.

### Task 1: Establish an isolated baseline

**Files:**

- Reference: `docs/superpowers/specs/2026-09-15-pro-dashboard-signal-studio-restoration-design.md`
- Reference: `Reports/launch-gate-evidence/2026-08-13/pro-dashboard-design-b-parity/`

- [ ] **Step 1: Create the restoration worktree**

```bash
git worktree add .worktrees/pro-dashboard-signal-studio-restoration -b feat/pro-dashboard-signal-studio-restoration main
```

Expected: a clean worktree containing the committed specification and plan; the four existing auth-fix files remain only in the original tree.

- [ ] **Step 2: Verify baseline and provenance**

```bash
git status --short
git rev-parse HEAD
git show --stat --oneline 4fbd79c -- 'src/components/pro/dashboard' src/app/globals.css
npm test -- 'src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.test.ts' src/components/pro/dashboard/dashboard-widgets.test.ts
```

Expected: clean status and focused tests pass.

### Task 2: Write failing restoration contracts

**Files:**

- Modify: `src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.test.ts`
- Modify: `src/components/pro/dashboard/dashboard-widgets.test.ts`

- [ ] **Step 1: Add the page composition contract**

```ts
test('dashboard restores Design B with Company-only semantics', () => {
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /<CompanySignalHero\b/u);
  assert.match(source, /signal-dashboard__hero/u);
  assert.match(source, /signal-dashboard__kpis/u);
  assert.match(source, /signal-dashboard__layout/u);
  assert.match(source, /order-1[^"']*lg:order-2[\s\S]*<ActionDeck/u);
  assert.match(source, /order-2[^"']*lg:order-1[\s\S]*<CaseVelocityChart/u);
  assert.doesNotMatch(source, /SignalHero|SignalKpis|TeamSignal|canViewTeam/u);
  assert.doesNotMatch(source, /name="owner"|activeClients|assignWork|operationsScore/u);
});
```

- [ ] **Step 2: Replace the six-card widget assertion**

```ts
it('uses a Company-only Design B hero', () => {
  const hero = source('CompanySignalHero');
  for (const key of ['companyName', 'readinessCodes', 'totalPrioritySignals', 'caseVelocity'])
    assert.match(hero, new RegExp(key));
  assert.match(hero, /signal-hero__chart/u);
  assert.doesNotMatch(hero, /activeClients|TeamSignal|ownerName|health\.score|assignWork/u);
});

it('renders four non-duplicated decision instruments', () => {
  const summary = source('CompanySummaryDeck');
  for (const key of ['readiness', 'documents', 'renewals', 'finance'])
    assert.match(summary, new RegExp(`key: '${key}'`));
  assert.doesNotMatch(summary, /key: 'registration'|key: 'actions'/u);
  assert.match(summary, /xl:grid-cols-\[1\.15fr_0\.85fr_0\.85fr_1fr\]/u);
});
```

- [ ] **Step 3: Prove RED and commit tests**

```bash
npm test -- 'src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.test.ts' src/components/pro/dashboard/dashboard-widgets.test.ts
git add 'src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.test.ts' src/components/pro/dashboard/dashboard-widgets.test.ts
git commit -m "test: define Signal Studio restoration contracts"
```

Expected: tests fail because the new hero/composition is absent, then the failing contracts are committed.

### Task 3: Build the Company-aware Signal hero

**Files:**

- Create: `src/components/pro/dashboard/CompanySignalHero.tsx`
- Modify: `src/components/pro/dashboard/index.ts`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json`
- Test: `src/components/pro/dashboard/CompanySignalHero.test.ts`
- Test: `src/components/pro/dashboard/dashboard-widgets.test.ts`

- [ ] **Step 1: Define the public contract and graph helper**

```tsx
import Link from 'next/link';
import type { AssignedCompanyProfile } from '@/lib/data/company-profile';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { applicationSignalHref, type ApplicationScope } from '@/lib/signal-studio-filters';
import { signalLabel } from './widget-format';

type Velocity = ProDashboardData['caseVelocity'];

export type CompanySignalHeroLabels = {
  companyFallback: string;
  prioritySignals: string;
  actionSummary: string;
  openActionDeck: string;
  openCompany: string;
  activationReadiness: string;
  ready: string;
  actionRequired: string;
  unavailable: string;
  registration: string;
  registrationUnavailable: string;
  velocityAria: string;
  velocityUnavailable: string;
};

export type CompanySignalHeroProps = {
  company: AssignedCompanyProfile | null;
  dashboard: Pick<ProDashboardData, 'totalPrioritySignals' | 'caseVelocity'>;
  tenantSlug: string;
  locale: string;
  filters: ApplicationScope;
  readinessAvailable: boolean;
  priorityAvailable: boolean;
  velocityAvailable: boolean;
  labels: CompanySignalHeroLabels;
};

function velocityPoints(data: Velocity, key: 'opened' | 'completed', maximum: number) {
  const denominator = Math.max(1, data.length - 1);
  return data
    .map((point, index) => `${(index / denominator) * 100},${40 - (point[key] / maximum) * 34}`)
    .join(' ');
}
```

- [ ] **Step 2: Implement the Design B semantic structure**

Use the exact `signal-hero` DOM and SVG structure from `git show 4fbd79c:src/components/pro/dashboard/SignalHero.tsx`. Replace its retired score and Assign Work UI with:

```tsx
const readiness =
  !company || !readinessAvailable
    ? labels.unavailable
    : company.readinessCodes.length === 0
      ? labels.ready
      : labels.actionRequired;
const applicationsHref = applicationSignalHref(tenantSlug, { view: 'open' }, filters);
const companyHref = `/t/${encodeURIComponent(tenantSlug)}/company`;

return (
  <section className="signal-hero relative isolate overflow-hidden rounded-[12px] p-[13px] text-white">
    <div aria-hidden="true" className="signal-hero__orb" />
    <div className="signal-hero__content">
      <p className="signal-hero__tag">
        ●{' '}
        {priorityAvailable
          ? `${integer.format(dashboard.totalPrioritySignals)} ${labels.prioritySignals}`
          : `${labels.prioritySignals}: ${labels.unavailable}`}
      </p>
      <h2>{company?.companyName ?? labels.companyFallback}</h2>
      <p>
        {labels.activationReadiness}: {readiness}
      </p>
      <dl className="signal-hero__facts">
        <div>
          <dt>{labels.registration}</dt>
          <dd>{labels.registrationUnavailable}</dd>
        </div>
        <div>
          <dt className="sr-only">{labels.prioritySignals}</dt>
          <dd>
            {priorityAvailable
              ? `${integer.format(dashboard.totalPrioritySignals)} ${labels.actionSummary}`
              : labels.unavailable}
          </dd>
        </div>
      </dl>
      <div className="signal-hero__actions">
        <Link href={applicationsHref} className="signal-hero__action-hot">
          {labels.openActionDeck}
        </Link>
        <Link href={companyHref} className="signal-hero__action-glass">
          {labels.openCompany}
        </Link>
      </div>
    </div>
    {velocityAvailable ? (
      <div
        role="img"
        aria-label={signalLabel(labels.velocityAria, velocityValues)}
        className="signal-hero__chart"
      >
        <svg aria-hidden="true" viewBox="0 0 100 44" preserveAspectRatio="none">
          <path
            d="M0 10H100M0 25H100M0 40H100"
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="0.4"
          />
          {openedPoints ? (
            <>
              <polygon points={`${openedPoints} 100,44 0,44`} fill="white" fillOpacity="0.22" />
              <polyline
                points={openedPoints}
                fill="none"
                stroke="white"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={completedPoints}
                fill="none"
                stroke="#ffb176"
                strokeWidth="1.2"
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </svg>
      </div>
    ) : (
      <div role="status" className="signal-hero__chart">
        <p>{labels.velocityUnavailable}</p>
      </div>
    )}
  </section>
);
```

Define `integer`, `opened`, `completed`, `maximum`, `openedPoints`, `completedPoints`, and `velocityValues` directly above the return from the last 14 current `dashboard.caseVelocity` points. Render polygon and polylines only when points exist. When velocity is unavailable, render only the localized status message—no SVG or numeric accessible claim.

- [ ] **Step 3: Export and translate**

```ts
export { CompanySignalHero, type CompanySignalHeroLabels } from './CompanySignalHero';
```

Add matching English and natural Arabic `hero` keys: `prioritySignals`, `actionSummary`, `openActionDeck`, `activationReadiness`, `ready`, `actionRequired`, `unavailable`, `registration`, `registrationUnavailable`, `velocityAria`, and `velocityUnavailable`. Preserve all existing keys.

- [ ] **Step 4: Run tests and commit**

```bash
npm test -- src/components/pro/dashboard/CompanySignalHero.test.ts src/components/pro/dashboard/dashboard-widgets.test.ts
git add docs/superpowers/plans/2026-09-15-pro-dashboard-signal-studio-restoration.md src/components/pro/dashboard/CompanySignalHero.tsx src/components/pro/dashboard/CompanySignalHero.test.ts src/components/pro/dashboard/index.ts src/components/pro/dashboard/dashboard-widgets.test.ts src/messages/en.json src/messages/ar.json
git commit -m "feat: add Company Signal Studio hero"
```

Expected: hero contract passes; page integration remains red.

### Task 4: Restore the four-card decision row

**Files:**

- Modify: `src/components/pro/dashboard/CompanySummaryDeck.tsx`
- Test: `src/components/pro/dashboard/dashboard-widgets.test.ts`

- [ ] **Step 1: Keep four primary definitions**

Retain exact current values, states, and hrefs for `readiness`, `documents`, `renewals`, and `finance`; remove only the duplicated `registration` and `actions` definitions. Add a `trend: number[]` to each definition using legal-section completion, pending-document indices, 7/30-day renewal totals, and due/overdue finance totals respectively.

- [ ] **Step 2: Restore Design B card geometry and bars**

```tsx
<div className="signal-kpis-grid grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.15fr_0.85fr_0.85fr_1fr]">
  {definitions.map((item) => {
    const trendMaximum = Math.max(1, ...item.trend.map((value) => Math.max(0, value)));
    return (
      <Link
        key={item.key}
        href={item.href}
        className={cn(
          'signal-kpi group relative min-h-[77px] overflow-hidden rounded-[9px] border p-[9px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          item.tone,
        )}
      >
        <span className="signal-kpi__content">
          <span className="text-muted-foreground block font-semibold tracking-[0.08em] uppercase">
            {item.label}
          </span>
          <strong className="block font-mono leading-none font-semibold tracking-tight tabular-nums">
            {item.value}
          </strong>
          <span className="signal-kpi__helper block max-w-[80%] truncate font-semibold">
            {item.helper}
          </span>
        </span>
        <span aria-hidden="true" className="signal-kpi__bars">
          {item.trend.map((value, index) => (
            <i
              key={index}
              style={{ height: `${Math.max(16, (Math.max(0, value) / trendMaximum) * 100)}%` }}
            />
          ))}
        </span>
      </Link>
    );
  })}
</div>
```

- [ ] **Step 3: Verify and commit**

```bash
npm test -- src/components/pro/dashboard/dashboard-widgets.test.ts
git add src/components/pro/dashboard/CompanySummaryDeck.tsx src/components/pro/dashboard/dashboard-widgets.test.ts
git commit -m "feat: restore Signal Studio decision cards"
```

Expected: widget tests pass.

### Task 5: Integrate the restored composition and CSS

**Files:**

- Modify: `src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.tsx`
- Modify: dashboard `loading.tsx` and `error.tsx`
- Modify: `src/app/globals.css`
- Test: `src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.test.ts`

- [ ] **Step 1: Replace `CompanyCommand` with `CompanySignalHero`**

Build `heroLabels` from existing Company/summary labels plus the new `hero` translations. Compute priority availability only when all contributing dashboard groups (`identity`, `links`, `operations`, `renewals`, `documents`, and `finance`) succeeded; compute velocity availability from the `operations` group. Render the hero inside `signal-dashboard__hero`, render the summary deck inside `signal-dashboard__kpis`, and leave the operational grid and current props unchanged.

```tsx
const priorityAvailable = (
  ['identity', 'links', 'operations', 'renewals', 'documents', 'finance'] as const
).every((group) => !dashboard.errors[group]);
const velocityAvailable = !dashboard.errors.operations;

<div className="signal-dashboard__hero">
  <CompanySignalHero
    company={company}
    dashboard={dashboard}
    tenantSlug={tenant.slug}
    locale={locale}
    filters={filters}
    readinessAvailable={companyContext.readinessState === 'data'}
    priorityAvailable={priorityAvailable}
    velocityAvailable={velocityAvailable}
    labels={heroLabels}
  />
</div>
<div className="signal-dashboard__kpis">
  <CompanySummaryDeck
    company={company}
    dashboard={dashboard}
    tenantSlug={tenant.slug}
    locale={locale}
    labels={summaryLabels}
    states={{
      readiness:
        companyContext.profileState === 'data' && companyContext.readinessState === 'data'
          ? undefined
          : { kind: 'error', message: t('companyUnavailable') },
      documents: stateFor(['documents']),
      renewals: stateFor(['renewals']),
      finance: stateFor(['finance']),
    }}
  />
</div>
```

- [ ] **Step 2: Selectively recover Design B CSS**

Compare current `src/app/globals.css` with `git show 4fbd79c:src/app/globals.css`. Restore final values for the `signal-dashboard*`, `signal-hero*`, `signal-kpis-grid`, `signal-kpi*`, `signal-panel`, `signal-action-deck`, and `signal-action-card*` families. Add `.signal-hero__facts` consistent with the compact hero typography. Do not restore score, Team, Client, owner-filter, or disabled-branch selectors.

- [ ] **Step 3: Match loading/error geometry**

Update loading to one dark hero skeleton, four compact card skeletons, and the asymmetric content/rail skeleton. Retain `aria-busy`, status copy, sanitized error text, and retry behavior.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- 'src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.test.ts' src/components/pro/dashboard/dashboard-widgets.test.ts src/components/pro/dashboard/dashboard-links.test.ts
git diff --check
git add 'src/app/(tenant)/t/[tenant]/(pro)/dashboard' src/components/pro/dashboard src/app/globals.css
git commit -m "feat: restore PRO dashboard Signal Studio"
```

Expected: focused tests pass with no whitespace errors.

### Task 6: Run release and browser gates

**Files:**

- Modify only as a focused failing check requires: dashboard files above
- Create: `Reports/launch-gate-evidence/2026-09-15/pro-dashboard-signal-studio-restoration/verification.md`
- Create: screenshot evidence beside the report

- [ ] **Step 1: Run static and unit gates**

```bash
npm test
npx tsc --noEmit
npm run lint
npx prettier --check src/app/globals.css src/components/pro/dashboard 'src/app/(tenant)/t/[tenant]/(pro)/dashboard' src/messages/en.json src/messages/ar.json
git diff --check
npm run build
```

Expected: all tests and build pass; TypeScript/ESLint have zero errors; formatting and diff checks pass.

- [ ] **Step 2: Scan forbidden semantics**

```bash
rg -n 'TeamSignal|canViewTeam|activeClients|name="owner"|filters\.owner|allOwners|operationsScore|workloadBalance|assignWork' 'src/app/(tenant)/t/[tenant]/(pro)/dashboard' src/components/pro/dashboard/CompanySignalHero.tsx src/components/pro/dashboard/CompanySummaryDeck.tsx
```

Expected: no matches.

- [ ] **Step 3: Capture authenticated acceptance evidence**

Start `npm run dev` and use the existing safe local PRO session without bypassing MFA or creating production data. Capture English light at 1440×900 and 1920×1080, dark at 1440×900, tablet at 1024×768 and 768×1024, mobile at 390×844, and Arabic RTL at 1440×900.

- [ ] **Step 4: Exercise interaction/accessibility**

With agent-browser, verify range links, service filter, Company/action links, four cards, chart data alternative, deadline keyboard interaction, dark mode, RTL, console, overflow, and axe WCAG 2/2.1 A/AA. Add a focused RED/GREEN test before correcting any defect.

- [ ] **Step 5: Record exact evidence**

Create `verification.md` with the fixed provenance (`d7c08af` baseline and `4fbd79c` visual source), the exact unit-test pass/fail totals, TypeScript/ESLint/build exit results, every screenshot filename with viewport/theme/locale, axe and keyboard results, console/overflow results, and every unresolved limitation stated explicitly. Do not claim a gate that was skipped.

- [ ] **Step 6: Commit evidence and corrections**

```bash
git add src Reports/launch-gate-evidence/2026-09-15/pro-dashboard-signal-studio-restoration
git commit -m "test: verify Signal Studio restoration"
```

### Task 7: Final integration review

**Files:**

- Review: complete branch diff against `d7c08af`

- [ ] **Step 1: Confirm scope**

```bash
git status --short
git diff --stat d7c08af...HEAD
git diff d7c08af...HEAD -- src/lib/auth src/lib/data/company-profile.ts src/lib/data/pro-dashboard.ts
```

Expected: clean worktree and no auth, assignment, or data-layer changes. The separate auth fix from the original tree is absent.

- [ ] **Step 2: Re-run release gates from clean HEAD**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check d7c08af...HEAD
```

Expected: all gates pass.

- [ ] **Step 3: Reject visual approximation**

Compare final screenshots with August 13. Confirm the dark mesh hero, compact masthead, four tinted instruments, near-black rail, warm canvas, asymmetric grid, mobile ordering, dark theme, and Arabic RTL.

- [ ] **Step 4: Prepare merge handoff**

Record final SHA and results. Merge only after explicit user approval, preserving the separate auth-fix changes in the original tree.
