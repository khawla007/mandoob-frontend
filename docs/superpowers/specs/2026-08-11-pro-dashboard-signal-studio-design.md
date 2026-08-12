# PRO Dashboard — Signal Studio Design

**Status:** Implemented
**Date:** 2026-08-11
**Audience:** PRO firm owners, operations managers, and case officers

Automated implementation and test coverage are complete. Authenticated browser visual and axe execution still requires a valid PRO storage state; without it, those scenarios skip by design. The available browser preview is verification evidence, not a deployment.

## Outcome

Replace the current analytics-only PRO overview with a daily operations command center. The dashboard must show what needs attention, why it matters, who owns it, and the next action, while preserving Mandoob's public-site color hierarchy in light and dark modes.

The approved direction is **B2 — Signal Studio**: a premium, information-dense interface using warm neutrals, the existing `#ff5722` brand accent, restrained semantic colors, layered gradients, geometric patterns, and operational charts.

## Product priorities

The first screen answers these questions in order:

1. What is urgent today?
2. Are applications moving or blocked?
3. Which licences, visas, Emirates IDs, establishment cards, or leases are nearing expiry?
4. Is the team within service targets?
5. What has been billed, collected, or become overdue?

The dashboard is not a replacement for full module pages. Every summary widget links to a filtered working view.

## Page structure

### 1. Application shell

- Keep the existing PRO navigation and permissions model.
- Make **Command Center** the active overview item.
- Preserve global search, notifications, PRO firm identity, user menu, and theme control.
- Show navigation counters only for actionable totals such as blocked cases, missing documents, and unread messages.

### 2. Signal hero

The hero is the strongest visual element and combines:

- number of priority signals;
- operational health score;
- urgent-case summary;
- primary actions: **Open action deck** and **Assign work**;
- a compact live velocity chart comparing cases opened with cases completed.

Its background uses a layered dark-to-orange mesh with a subtle diagonal service pattern. It remains dark in both themes, with WCAG-compliant text and controls.

The operational health score is derived from transparent inputs rather than an unexplained vanity score:

- overdue case ratio;
- cases completed within SLA;
- blocked cases older than their threshold;
- renewal reminders sent on time;
- workload imbalance across assigned staff.

A tooltip or detail drawer must explain the score calculation.

### 3. KPI signal cards

Show four compact cards:

| Widget         | Primary value                             | Supporting information     | Destination                  |
| -------------- | ----------------------------------------- | -------------------------- | ---------------------------- |
| Active clients | Active clients for the signed-in PRO firm | Month-over-month change    | Clients                      |
| Open cases     | Active registration/service cases         | Moving vs. blocked         | Applications                 |
| Renewals due   | Due within 30 days                        | Due within 7 days          | Renewals filtered to 30 days |
| Collections    | Collected amount for current month        | Percentage of billed value | Finance                      |

Each card uses a different low-saturation tinted surface or subtle gradient. Orange remains the primary accent; blue, amber, green, and red are semantic signals rather than decorative branding.

### 4. Case velocity

An area chart compares:

- applications opened;
- applications completed.

Default range is 30 days, with 7-day and 90-day options. Empty periods render as zero values. Hover/focus reveals date and exact totals. The chart must include a text summary for screen readers.

### 5. Action deck

Show the highest-priority cases ranked by:

1. breached or nearest SLA;
2. regulatory expiry date;
3. blocked duration;
4. missing required documents;
5. manual priority.

Each card includes client, service type, blocking reason, owner, remaining time, and a direct action. Countdown labels such as **5 min**, **42 min**, or **2 hours** use semantic tinted backgrounds and must never rely on color alone.

### 6. Deadline intensity heatmap

Display workload concentration by weekday and time period. The visual indicates dates with high submission, appointment, or renewal pressure. Keyboard focus and hover reveal exact counts and event types. A list fallback is required on small screens and for assistive technology.

### 7. Collections waterfall

Show the relationship between:

- billed amount;
- paid amount;
- due-soon amount;
- overdue amount.

Values use the PRO firm's reporting currency, AED by default. Clicking a bar opens the corresponding filtered invoice list. The widget is visible only to roles with finance permission.

### 8. Renewal streams

Use directional segmented bars rather than a circular chart. Group expiries by:

- trade licences;
- visas and Emirates IDs;
- establishment cards;
- tenancy or lease documents.

Support 7-, 30-, 60-, and 90-day windows. Each stream links to the renewal list with matching type and date filters.

### 9. Team signal

Show active workload per team member, including assigned open cases and capacity percentage. This widget is visible to managers; individual case officers see their own workload and team-average comparison. It must not rank staff solely by raw completion count.

## Color and visual system

Use existing homepage tokens as the source of truth:

- brand accent: `#ff5722`;
- warm near-white paper and warm dark ink;
- warm-neutral border and muted text ramps;
- dark-mode surfaces derived from the current authenticated-app tokens.

Additional semantic colors:

- red: urgent, overdue, breached;
- amber: approaching deadline or blocked;
- blue: informational or government-processing stage;
- green: completed, collected, or healthy.

Rules:

- reserve saturated orange for key actions, selected navigation, and the most important graph series;
- use gradients inside hero, KPI, and data-visualization surfaces only;
- do not place gradients behind dense tables or long text;
- retain visible borders so widgets remain readable in both themes;
- use a subtle diagonal geometric pattern as the distinctive Signal Studio motif.

## Interaction behavior

- Every widget provides a clear destination or filtered drill-down.
- Hover states lift or brighten only interactive surfaces.
- Charts support mouse, keyboard, and touch exploration.
- Loading uses shape-matched skeletons to prevent layout shift.
- Errors remain local to the affected widget and offer retry where appropriate.
- No data states explain the next useful action instead of displaying an empty graph.
- Dashboard filters include date range, case owner, branch, and service type where relevant.

## Responsive behavior

- **Desktop:** hero and graphs use an asymmetric two-column layout.
- **Tablet:** navigation collapses; secondary widgets stack beneath the main chart.
- **Mobile:** single column; Action Deck appears before analytics; heatmap becomes a deadline list; charts remain horizontally readable without page-level scrolling.
- Primary actions remain reachable without requiring hover.

## Data and implementation boundaries

Use PRO-scoped server-side queries and existing authorization helpers. Do not calculate authoritative business metrics solely in the browser. Internally, `tenant_id`, tenant isolation, and the `/t/{slug}` route form the PRO data boundary; they are implementation identifiers and are not customer-facing terminology.

Required dashboard data contract:

- active-client count and comparison;
- open, moving, and blocked case totals;
- opened/completed daily case series;
- prioritized action items with SLA and owner;
- expiry totals grouped by type and window;
- deadline-density series;
- billed, paid, due, and overdue amounts;
- team workload summary;
- operational health inputs and score explanation.

Queries should run in parallel, cache only where PRO data isolation and freshness permit, and degrade widget-by-widget when a source is unavailable.

## Delivery sequence

1. Establish dashboard data contract and tests.
2. Build the responsive Signal Studio shell using current design tokens.
3. Implement priority hero, KPI cards, and Action Deck.
4. Add case velocity, renewal streams, deadline heatmap, and collections waterfall.
5. Add team signal and operational-score explanation.
6. Connect drill-down filters to Applications, Renewals, Documents, Tasks, and Finance.
7. Verify light/dark themes, permissions, localization, accessibility, loading/error/empty states, and responsive layouts.

## Acceptance criteria

- Dashboard uses real PRO-scoped data; no mock metrics remain.
- Urgent work and its next action are visible without scrolling at standard desktop size.
- All summary widgets navigate to useful filtered views.
- Light and dark themes preserve the homepage color hierarchy.
- The design remains understandable without gradients, animation, or color perception.
- Finance and manager-only information respects existing permissions.
- Keyboard navigation, focus visibility, contrast, and chart alternatives meet accessibility requirements.
- Desktop, tablet, and mobile layouts have no clipped controls or page-level horizontal overflow.

## Out of scope

- Rebuilding every missing PRD module in the dashboard task.
- Replacing the existing PRO shell or brand identity.
- Introducing a second design-token system.
- Creating decorative metrics without a reliable business definition.
