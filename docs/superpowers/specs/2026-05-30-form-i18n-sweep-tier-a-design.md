# Form i18n Sweep (Tier A) — Design

**Date:** 2026-05-30
**Status:** Approved (brainstorming) → ready for implementation plan
**Source task:** `Reports/daily-work-report.md` Upcoming Tasks — "complete broader form-label internationalization"
**Follow-on:** Task 3 — native Arabic review of new strings (consumes this work's `ar.json` output)

## Context

PR 20 internationalized error messages in `QuestionnaireForm` and `RegisterProForm` and added `errors.*` keys, but left many user-facing labels, headings, placeholders, and button strings hardcoded in English across the form layer. The daily report carries forward "broader form-label internationalization" as the next task.

A scoping sweep found two populations:
- **Tier A** — forms that already use `useTranslations` but still hold stray literals (~88 strings, 8 files).
- **Tier B** — forms with no i18n at all: admin, pro-settings, estimator, leads, contact (~200 strings, 22 files).

This spec covers **Tier A only**. Tier B is a separate, larger initiative (new namespaces, full `ar.json` build) and is explicitly out of scope. The intended outcome: every user-visible string in the eight Tier-A forms resolves through `next-intl`, with English and dev-translated Arabic in parity, and a clean handoff list for native Arabic review.

## Scope

Eight files, ~88 strings:

| Component | Namespace | Approx strings |
|---|---|---|
| `src/components/auth/LoginForm.tsx` | `auth` | 1 (email placeholder) |
| `src/components/auth/RegisterForm.tsx` | `auth` | 9 (password-rule lines, PDPL consent, placeholder) |
| `src/components/auth/RegisterProForm.tsx` | `auth` | 12 (section headings, field labels, submit states, success copy) |
| `src/components/account/ProfileGeneralForm.tsx` | `account` | 18 (card titles, descriptions, select prompts, locale labels) |
| `src/components/pro/CreateClientForm.tsx` | `pro` | 4 (dialog desc + prose placeholders) |
| `src/components/pro/NewRenewalDialog.tsx` | `pro` | 2 (desc + placeholder) |
| `src/components/customer/UploadDocumentDialog.tsx` | `customer` | 2 (error literals) |
| `src/components/questionnaire/QuestionnaireForm.tsx` | **new `questionnaire`** | ~40 (steps, options, section titles, buttons, summary copy) |

**Already clean — no work:** OtpForm, ForgotPasswordForm, ResetPasswordForm, InviteAcceptForm, MfaChallengeForm, PasswordChangeForm, RoleCustomerForm, RoleEmployeeForm, RoleProForm.

**Out of scope:** all Tier B files (admin/*, pro Settings*/Edit*/NewInvoice/RequestDocument, estimator/CostEstimator, leads/LeadKanbanBoard, MfaEnrollCard, contact page).

## Design Decisions

### 1. Namespaces
Reuse existing nested namespaces (`auth`, `account`, `pro`, `customer`) in `src/messages/en.json` + `ar.json`. Add one new top-level namespace `questionnaire` for the 40 questionnaire strings — too many to fold into an existing namespace cleanly, and it is a self-contained feature surface.

### 2. Reuse `common` for shared verbs
`common.*` already defines `back`, `next`, `cancel`, `save`, `saving`, `submit`, `loading`. Reuse `common.back` and `common.cancel` verbatim. **Caution:** the questionnaire button reads "Continue", not "Next" — do **not** collapse it into `common.next` ("Next"), which would change the visible text. Add a `questionnaire.continue` key to preserve the exact wording. **Do not** add duplicate keys for verbs that already match a `common` value exactly.

### 3. Questionnaire module-scope arrays (core technical decision)
`STEPS`, `JURISDICTION_OPTIONS`, `OFFICE_OPTIONS`, `DOCUMENT_OPTIONS`, `ADD_ONS` are declared at **module scope** in `QuestionnaireForm.tsx` (lines ~40–104), where the `useTranslations` hook is unavailable.

Pattern:
- Keep each array's stable `value`/`id` (these are logic keys — feed the schema, form state, and routing; **must not change**).
- Remove the literal `label` field from the module-scope arrays.
- Resolve labels **inside the component** via `t()` keyed by the stable value, e.g. `t(\`options.jurisdiction.${value}\`)`, `t(\`steps.${id}\`)`.
- Build display arrays inside the component with a plain `.map` over the value-only consts (cheap; no memoization needed).

This keeps all logic/schema/validation untouched — pure label resolution.

### 4. Arabic (`ar.json`)
Every new `en.json` key gets a dev-translated `ar.json` twin, matching the tone of existing `ar.json` entries. All ~88 new keys are flagged for **task 3** native review. The implementation produces a handoff artifact: the flat list of new `questionnaire.*` / `auth.*` / `account.*` / `pro.*` / `customer.*` keys added, so the native reviewer has an exact worklist.

### 5. Placeholders
- **Key** prose-hint placeholders: `you@company.com`, "A few sentences about yourself…", "Select language", "Select timezone", "Select date format".
- **Leave literal** format/sample placeholders (language-invariant patterns): `DED-123456`, `Acme Trading LLC`, `Dubai Mainland`, `784-YYYY-NNNNNNN-N`, `smtp.example.com`, `https://example.com/me.jpg`.

## Delivery

Two commits on the current feature branch:
1. **Commit 1** — 7 simple forms (Login, Register, RegisterPro, ProfileGeneral, CreateClient, NewRenewal, UploadDocument) + their `en.json`/`ar.json` keys.
2. **Commit 2** — `QuestionnaireForm` + the module-scope array → `t()` refactor + `questionnaire` namespace.

Isolating the risky array refactor in its own commit eases review and revert.

## Verification

Per commit:
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (no new warnings).
- Browser smoke (dev server, `agent-browser`) on each touched form in **both locales**:
  - English: labels render, no `next-intl` missing-key console errors.
  - Arabic (toggle via LanguageSwitcher): Arabic strings render, RTL intact, no missing-key errors.
  - Touched routes: `/register`, `/register/pro`, account profile page, questionnaire (public application), a pro page hosting CreateClient/NewRenewal dialogs, a customer page hosting UploadDocument dialog.
- Confirm `en.json` and `ar.json` have identical key sets (no orphan/missing keys) — structural parity check.

## Handoff to Task 3

Output a flat list of every new key (namespace.key) added in both messages files. That list is the native Arabic reviewer's worklist.

## Documentation impact (CLAUDE.md §13)

- No API/flow/route change → no `docs/documentation/api` or `flows` updates.
- After implementation: note in daily report which files + namespaces changed; update Upcoming Tasks (task 2 done, task 3 unblocked with the key list).
