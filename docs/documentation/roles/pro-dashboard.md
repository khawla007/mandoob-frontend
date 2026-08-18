# PRO Operations Dashboard

## Purpose and access

Signal Studio is the signed-in PRO's command center for the one assigned company. It combines urgent applications, renewals, document work, invoices, workload, and service performance without replacing the working module pages.

The dashboard requires an authenticated PRO user and a live company assignment. The parent tenant layout rejects a signed-in user whose authoritative assignment does not match the URL; an unknown tenant returns not found, while an inactive tenant receives the dashboard's suspended-account state. Finance and operational widgets are available only inside the assigned company scope.

Applications also requires an authenticated PRO user. The parent layout applies the same live-assignment and unknown-tenant behavior before the page runs. The page then rejects an inactive tenant through the active guard; it does not use the dashboard's suspended-account state.

## Dashboard controls

- `range=7|30|90` controls case velocity and deadline intensity; 30 days is the default.
- `owner={profile UUID}` limits application-derived metrics and links to an active PRO owner.
- `serviceType={value}` limits application-derived metrics and links to a known service type.
- Owner and service filters are preserved when changing range or following application drill-downs.
- Invalid filter values are rejected and the interface explains that the previous valid scope was retained.
- Branch is visible but disabled because the data model has no branch dimension. No branch result is inferred or fabricated.

Dates, deadline periods, current-month comparisons, and finance cutoffs use Dubai business time (`Asia/Dubai`). Heatmap morning is 00:00–12:00 and afternoon is 12:00–24:00 Dubai time; date-only deadlines belong to afternoon.

## Shipped widgets

| Widget                | Definition                                                                                                       | Main drill-down                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Signal hero           | Priority-action count, explainable operational health score, and compact opened/completed velocity               | Open applications or assign work                             |
| Assigned company      | Current company identity and operational status                                                                  | Assigned Company                                             |
| Open cases            | All cases except completed/cancelled, split into moving and blocked                                              | Open Applications view                                       |
| Renewals due          | Active overdue backlog plus upcoming renewals within 30 days, with a 7-day detail                                | Active Renewals, 30 days                                     |
| Collections           | Current-month net collections and net collections as a percentage of current-month billed value                  | Paid invoice view                                            |
| Case velocity         | Daily applications opened and completed for 7, 30, or 90 days; missing dates are zero                            | Open Applications view                                       |
| Action Deck           | Highest-priority cases, renewals, pending document work, and open invoices                                       | The exact application, renewal, company document, or invoice |
| Deadline intensity    | Morning/afternoon counts for dated action items across the selected range                                        | Filtered application, renewal, document, or invoice view     |
| Collections waterfall | Current-month billed and paid totals plus open invoices due within 30 days or overdue                            | Matching invoice view                                        |
| Renewal streams       | Cumulative active renewal backlog at 7, 30, 60, and 90 days for licence, visa, Emirates ID, and Ejari/lease work | Matching active renewal type and window                      |
| Work signal           | Active application count, capacity percentage, and unassigned work for the assigned company                      | Applications filtered by owner or open status                |

The compact Action Deck keeps the highest-ranked five items for the assigned company. SLA cases come first and rank breached then nearest deadline; renewals follow by deadline, blocked cases by oldest `updated_at`, documents next, other cases by priority, and invoices last. The hero count includes every ranked priority signal, including items beyond the five-card deck. For blocked cases, `updated_at` is the blocked-since proxy because the schema does not yet have `blocked_at`. Work capacity uses ten active cases as the explicit 100% utilization target and can show values above 100%.

## Operational health formula

The score is the rounded, equally weighted mean of five 0–100 signals. Each input contributes 20%:

1. `100 − overdue case ratio`: open cases whose SLA deadline, or due date when no SLA exists, has passed.
2. `SLA completion rate`: completed cases with an SLA that finished on or before that SLA.
3. `100 − aged blocked ratio`: open cases blocked for at least three days, using `updated_at` as the blocked-age proxy.
4. `Reminder rate`: for each active renewal with an elapsed reminder schedule, only its latest elapsed schedule is measured. Its last notification is on time when sent from that schedule through the next 24 hours; renewals with only future schedules are not measurable.
5. `Workload balance`: balance across active PRO owners, including unassigned open work as a workload bucket.

The score is zero when the assigned company has no cases or renewals. The score dialog exposes every input and indicates whether higher or lower is healthier; it is an operational signal, not an employee ranking.

## Finance semantics

All finance values use one reporting currency. AED wins when present; otherwise the most frequent invoice/payment currency is selected, with an alphabetical tie-breaker, and an empty ledger defaults to AED. Amounts from other currencies are excluded rather than converted.

- **Billed:** non-draft, non-void invoices created during the current Dubai business month.
- **Paid/collected:** succeeded, refunded, or partially refunded payments received during the current Dubai business month, minus succeeded refunds created during that month.
- **Due soon:** open reporting-currency invoices due from today through the next 30 days.
- **Overdue:** open reporting-currency invoices due before today.
- **Collection rate:** current-month net collected divided by current-month billed; zero when billed is zero.

## Drill-down contracts

All paths below are scoped to the signed-in PRO's live company assignment. The technical `/t/{pro-slug}` prefix is the internal routing boundary.

- **Assigned Company:** `/t/{pro-slug}/company`.
- **Applications:** `view=open`, `case={UUID}`, or `date=YYYY-MM-DD` with `period=morning` or `period=afternoon` and `eventTypes=case`. Optional `owner={UUID}` and `serviceType={value}` are preserved.
- **Renewals:** `tab=active`, optionally with `type` set to `license`, `visa`, `eid`, or `ejari`; `days` set to `7`, `30`, `60`, or `90`; `target={UUID}`; or the `date`, `period`, and `eventTypes=renewal` deadline contract.
- **Company documents:** `/t/{pro-slug}/documents?request={UUID}` or `document={UUID}`.
- **Payments:** `view=billed`, `view=paid`, `view=due-soon`, or `view=overdue`. Deadline cells use `view=due-date` with `date`, `period`, and `eventTypes=invoice`.
- **Exact invoice:** `/t/{pro-slug}/payments/{invoice UUID}`.

Malformed UUIDs, dates, periods, types, ranges, and views are ignored or fall back to the safe unfiltered/default view. Collection drill-downs are database-paginated at 50 rows, capped at 100 rows per request.

## Applications workspace and lifecycle

Applications is a working page, not a dashboard placeholder. A PRO user can create an application for the assigned company, filter by status, owner, or service type, follow exact dashboard targets, page through 50-row results, and complete or cancel eligible work. Rows show company, service, status, owner, SLA/due dates, and the available action.

The lifecycle is:

`draft → documents_pending → ready_to_submit → submitted → authority_review → approved → completed`

`cancelled` is a terminal alternative. Completion requires `completed_at`; every non-completed status requires it to be null. Priorities are low, normal, high, and urgent. Writes validate company ownership, the live PRO assignment, status/timestamp invariants, and audit metadata before an atomic mutation.

## Loading, empty, and error behavior

- Route loading renders shape-matched, `aria-busy` skeletons; reduced-motion users receive no pulse animation.
- A widget with no useful rows explains the condition and links to the next working view instead of showing a blank chart.
- Data sources fail independently. A local alert and retry link replace only widgets that depend on the failed identity, operations, renewal, document, link, or finance group.
- Retry URLs retain the selected range and valid filters.
- An unavailable operations source preserves requested filters as pending rather than silently discarding them.
- The dashboard-level error boundary offers retry; inactive company workspaces receive a dedicated status instead of partial data.

## Visual, responsive, localization, and accessibility behavior

Signal Studio uses the existing orange brand accent, warm paper/ink surfaces, visible borders, and a restrained diagonal signal motif. Red means urgent or breached, amber means approaching/blocked, blue means informational or government processing, and green means completed, collected, or healthy. Labels, icons, and numeric text accompany color. Light and dark themes use the same semantic hierarchy, and RTL layout is supported.

The desktop layout is asymmetric; tablet layouts stack secondary panels; mobile places the Action Deck before analytics and replaces the desktop heatmap grid with a readable deadline list. Controls remain usable without hover. Motion is limited to interactive transitions and skeletons and is disabled by `prefers-reduced-motion` utilities.

- The heatmap is a labelled grid with one tab stop, Arrow keys, Home, and End navigation. Direction follows RTL/LTR, Enter/Space opens a details dialog, Escape closes it, and focus returns to the originating cell.
- The case velocity graphic is hidden from assistive technology. A text summary and keyboard-expandable semantic table provide dates and exact opened/completed totals.
- Tooltips supplement rather than replace the accessible table; focus indicators are visible on links, buttons, filters, and dialog controls.
- Empty states use `status`, local failures use `alert`, and loading regions expose `aria-busy` and screen-reader labels.

## Data boundary and migrations

Internally, `tenant_id`, tenant isolation, and `/t` routes implement the PRO data boundary. Every dashboard input is filtered to the authenticated PRO identifier before aggregation, linked records are rechecked, and server-side authorization rejects cross-company access. These internal names must not appear in user-facing copy.

Migrations 0047–0056 establish and harden the feature:

- **0047–0049:** create service cases, constraints, indexes, row-level policies, audit actions, and atomic create/update RPCs.
- **0050–0051:** restrict direct writes, re-authorize active PRO mutations inside security-definer functions, and provide a security-invoker ranked read view available only to the service role.
- **0052–0054:** enforce invoice/payment/refund relationships, active same-PRO case ownership, automatic unassignment after invalid owner transitions, and safe profile-boundary changes.
- **0055:** make administrative role changes atomic and guard service-case history and linked company membership.
- **0056:** provide authorized, PRO-scoped, paginated Signal Studio invoice drill-downs with Dubai-time and payment-minus-refund semantics.

Legacy relationship constraints introduced as `NOT VALID` protect new writes without claiming historical rows are already reconciled. Operational reads still apply application-level ownership checks.

## Verification and current limitation

Run from the frontend repository:

```bash
node --import tsx --conditions=react-server --test \
  src/lib/validation/service-case.test.ts \
  src/lib/data/service-cases.test.ts \
  src/lib/data/pro-dashboard.test.ts \
  src/components/pro/dashboard/dashboard-links.test.ts \
  src/lib/shell/nav-pro.test.ts \
  src/lib/i18n/messages.test.ts
npm test
npm run lint
npm run build
npx prettier --check docs/superpowers/specs/2026-08-11-pro-dashboard-signal-studio-design.md docs/documentation/roles/pro-dashboard.md
npx playwright test tests/a11y/pro-dashboard.spec.ts
```

On Node 20, `npm test` can fail before discovery because the quoted `src/**/*.test.ts` glob is passed literally. Use the explicit `node --import tsx --conditions=react-server --test ...` form with resolved test paths when verifying on that runtime.

Authenticated Playwright scenarios require `tests/.auth/pro.json`, normally produced from `E2E_PRO_EMAIL`, `E2E_PRO_PASSWORD`, and the configured PRO slug. Missing storage state causes authenticated responsive, light/dark, keyboard, visual, and axe scenarios to skip with an explicit reason; a stale state that redirects to login fails. As of this handoff, automated implementation/tests are complete, but authenticated visual and axe execution awaits a valid PRO auth state. The local preview is not a deployment.
