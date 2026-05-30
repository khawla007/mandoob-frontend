# Form i18n Sweep (Tier A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every user-visible string in 8 partially-internationalized form components through `next-intl`, with English + dev-translated Arabic in key parity.

**Architecture:** Wire components to existing message keys where they exist; add new keys to existing namespaces (`auth`, `account`, `pro`, `customer`, `errors`); add one new `questionnaire` namespace for the questionnaire form. Module-scope option arrays keep their stable `value`/`id` and resolve labels via `t()` inside the component. Every new `en.json` key gets a dev-translated `ar.json` twin, flagged for task 3.

**Tech Stack:** Next.js 16, React 19, next-intl, TypeScript strict, react-hook-form, Zod.

**Spec:** `docs/superpowers/specs/2026-05-30-form-i18n-sweep-tier-a-design.md`

---

## Conventions for every task

- Message edits go in **both** `src/messages/en.json` and `src/messages/ar.json`. Same key path in both. Never add an English key without its Arabic twin.
- Arabic values are **dev-translated** (best effort, matching tone of existing `ar.json`). All flagged for task-3 native review.
- Run from `frontend/`.
- After each code task: `npx tsc --noEmit` must be clean and `npm run lint` must add no new warnings.

## Explicit exclusions (do NOT internationalize in this task)

These were considered and deliberately left literal:

- **Zod schema validation messages** (e.g. `RegisterForm` `z.string().min(8, 'At least 8 characters')`). Module-scope; needs resolver-level i18n — separate effort.
- **Language endonyms** in `ProfileGeneralForm` `LOCALE_LABELS` (`'English'`, `'العربية (Arabic)'`) — language names are shown in their own script regardless of UI locale.
- **Format/sample placeholders**: `DED-123456`, `Acme Trading LLC`, `Dubai Mainland`, `+971501234567`, `784-YYYY-...`, `smtp.example.com`, `https://example.com/me.jpg`, `harman_admin`, `Platform Administrator`, date-format example strings in `DATE_FORMAT_LABELS`.
- **Dev-prefixed `setError` strings** of the form `` `${result.code}: ${result.error}` `` and `'INVALID_INPUT: select a client'` — these echo a server/code contract, consistent across the app.

---

# COMMIT 1 — Seven simple forms

## Task 1: Add message keys for the simple forms

**Files:**

- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json`

- [ ] **Step 1: Add new keys to the `auth` namespace** (both files)

Add these keys inside the existing `auth` object in `en.json` (Arabic twins in `ar.json`):

```jsonc
// en.json — auth
"emailPlaceholder": "you@company.com",
"passwordsMatch": "Passwords match.",
"pwRuleLength": "At least 8 characters",
"pwRuleUppercase": "An uppercase letter",
"pwRuleLowercase": "A lowercase letter",
"pwRuleSpecial": "A special character",
"passwordRequirements": "Password requirements",
"dismissPasswordRequirements": "Dismiss password requirements",
"firmSection": "Firm",
"firmName": "Firm name",
"plan": "Plan",
"phoneE164": "Phone (E.164)",
"yourAccount": "Your account",
"submittingReview": "Submitting…",
"submitForReview": "Submit for review",
"proSubmittedTitle": "Submitted"
```

```jsonc
// en.json — auth.longCopy (add one key to the existing longCopy object)
"proSignupPending": "Your PRO firm signup is awaiting approval. We'll email {email} when an admin reviews it. Until then, your tenant is in pending status."
```

Arabic twins (dev-translated) in `ar.json` — same key paths. Example values:

```jsonc
// ar.json — auth
"emailPlaceholder": "you@company.com",
"passwordsMatch": "كلمتا المرور متطابقتان.",
"pwRuleLength": "٨ أحرف على الأقل",
"pwRuleUppercase": "حرف كبير واحد",
"pwRuleLowercase": "حرف صغير واحد",
"pwRuleSpecial": "رمز خاص واحد",
"passwordRequirements": "متطلبات كلمة المرور",
"dismissPasswordRequirements": "إغلاق متطلبات كلمة المرور",
"firmSection": "الشركة",
"firmName": "اسم الشركة",
"plan": "الباقة",
"phoneE164": "الهاتف (E.164)",
"yourAccount": "حسابك",
"submittingReview": "جارٍ الإرسال…",
"submitForReview": "إرسال للمراجعة",
"proSubmittedTitle": "تم الإرسال"
// auth.longCopy.proSignupPending:
"proSignupPending": "تسجيل شركتك قيد الموافقة. سنراسلك على {email} عند مراجعة المشرف له. حتى ذلك الحين، يكون حسابك في حالة انتظار."
```

- [ ] **Step 2: Add new keys to the `account` namespace** (both files)

```jsonc
// en.json — account
"identitySection": "Identity",
"contactLocaleSection": "Contact & Locale",
"aboutSection": "About",
"selectLanguage": "Select language",
"selectTimezone": "Select timezone",
"selectDateFormat": "Select date format",
"bioPlaceholder": "A few sentences about yourself…",
"markdownNotSupported": "Markdown not supported."
```

```jsonc
// en.json — account.longCopy (add to existing longCopy object)
"readOnlyDetails": "Read-only details from your account record.",
"identityHelp": "How your name and avatar appear across the platform.",
"contactLocaleHelp": "Phone, language, timezone, and date format.",
"aboutHelp": "A short bio shown on your profile."
```

Arabic twins (dev-translated), same key paths:

```jsonc
// ar.json — account
"identitySection": "الهوية",
"contactLocaleSection": "الاتصال واللغة",
"aboutSection": "نبذة",
"selectLanguage": "اختر اللغة",
"selectTimezone": "اختر المنطقة الزمنية",
"selectDateFormat": "اختر تنسيق التاريخ",
"bioPlaceholder": "بضع جمل عن نفسك…",
"markdownNotSupported": "تنسيق ماركداون غير مدعوم."
// account.longCopy:
"readOnlyDetails": "تفاصيل للقراءة فقط من سجل حسابك.",
"identityHelp": "كيف يظهر اسمك وصورتك عبر المنصة.",
"contactLocaleHelp": "الهاتف واللغة والمنطقة الزمنية وتنسيق التاريخ.",
"aboutHelp": "نبذة قصيرة تظهر في ملفك الشخصي."
```

- [ ] **Step 3: Add new keys to `pro`, `customer`/`errors`** (both files)

```jsonc
// en.json — pro
"newClientIntro": "Capture the basics now — license, shareholders, and documents can be filled in later.",
"newRenewalIntro": "License renewals are created automatically from a client's license_expiry. Use this form for visas, Emirates IDs, and Ejari.",
"renewalLabelPlaceholder": "e.g. Investor visa — Mr. Khan"
```

```jsonc
// en.json — errors
"pickFileFirst": "Pick a file before uploading."
```

Arabic twins:

```jsonc
// ar.json — pro
"newClientIntro": "سجّل الأساسيات الآن — يمكن إدخال الرخصة والمساهمين والمستندات لاحقًا.",
"newRenewalIntro": "تُنشأ تجديدات الرخصة تلقائيًا من تاريخ انتهاء رخصة العميل. استخدم هذا النموذج للتأشيرات والهويات الإماراتية وإيجاري.",
"renewalLabelPlaceholder": "مثال: تأشيرة مستثمر — السيد خان"
// errors:
"pickFileFirst": "اختر ملفًا قبل الرفع."
```

- [ ] **Step 4: Verify both JSON files parse and have identical key sets**

Run:

```bash
node -e "const e=require('./src/messages/en.json'),a=require('./src/messages/ar.json');const keys=o=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?keys(v).map(s=>k+'.'+s):[k]).sort();const ek=keys(e),ak=keys(a);const miss=ek.filter(k=>!ak.includes(k)).concat(ak.filter(k=>!ek.includes(k)));console.log(miss.length?'MISMATCH: '+miss.join(', '):'PARITY OK ('+ek.length+' keys)')"
```

Expected: `PARITY OK (<n> keys)`

- [ ] **Step 5: Commit not yet** — keys are committed together with the wiring in the Commit 1 gate (Task 9). Move on.

---

## Task 2: Wire `LoginForm` email placeholder

**Files:**

- Modify: `src/components/auth/LoginForm.tsx`

- [ ] **Step 1: Replace the literal email placeholder**

Find the email `Input` with `placeholder="you@company.com"` and replace with `placeholder={t('emailPlaceholder')}`. `LoginForm` already calls `const t = useTranslations('auth')` — confirm and reuse it (do not add a second hook).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → clean. `npm run lint` → no new warnings.

---

## Task 3: Wire `RegisterForm`

**Files:**

- Modify: `src/components/auth/RegisterForm.tsx`

`t = useTranslations('auth')` and `tErrors = useTranslations('errors')` already exist.

- [ ] **Step 1: Email placeholder** — line ~158: `placeholder="you@company.com"` → `placeholder={t('emailPlaceholder')}`.

- [ ] **Step 2: Password-rule labels** — `computePasswordRules` is module-scope (can't call `t`). Change it to return rule **ids only**, and resolve labels at render.

Replace `computePasswordRules` (lines ~53-60) and the `PasswordRule` type:

```typescript
type PasswordRule = { id: string; labelKey: string; passed: boolean };

function computePasswordRules(pw: string): PasswordRule[] {
  return [
    { id: 'len', labelKey: 'pwRuleLength', passed: pw.length >= 8 },
    { id: 'upper', labelKey: 'pwRuleUppercase', passed: /[A-Z]/.test(pw) },
    { id: 'lower', labelKey: 'pwRuleLowercase', passed: /[a-z]/.test(pw) },
    { id: 'special', labelKey: 'pwRuleSpecial', passed: /[^A-Za-z0-9]/.test(pw) },
  ];
}
```

- [ ] **Step 3: Pass a translator into `PasswordRulesPopover`** — it is a module-scope component. Add a `t` prop typed as the next-intl return. At the call site (line ~202):

```tsx
{
  showRules && <PasswordRulesPopover rules={rules} onDismiss={() => setPwDismissed(true)} t={t} />;
}
```

Update the component signature and body:

```tsx
function PasswordRulesPopover({
  rules,
  onDismiss,
  t,
}: {
  rules: PasswordRule[];
  onDismiss: () => void;
  t: ReturnType<typeof useTranslations<'auth'>>;
}) {
```

Inside it: replace `aria-label="Dismiss password requirements"` → `aria-label={t('dismissPasswordRequirements')}`; replace the "Password requirements" heading text → `{t('passwordRequirements')}`; replace `<span>{r.label}</span>` → `<span>{t(r.labelKey)}</span>`.

Add `useTranslations` to the existing `next-intl` import if the type reference needs it (it is already imported).

- [ ] **Step 4: Passwords match/mismatch line** — lines ~230-234:

```tsx
{
  confirmPassword ? (confirmMatches ? t('passwordsMatch') : tErrors('passwordMismatch')) : '';
}
```

(`errors.passwordMismatch` already exists = "Passwords do not match".)

- [ ] **Step 5: Consent label** — lines ~253-256, replace the literal with the existing key:

```tsx
<FormLabel className="leading-snug font-normal">{t('longCopy.consentPdpl')}</FormLabel>
```

(`auth.longCopy.consentPdpl` already contains the exact text.)

- [ ] **Step 6: Verify** — `npx tsc --noEmit` clean; `npm run lint` no new warnings.

---

## Task 4: Wire `RegisterProForm`

**Files:**

- Modify: `src/components/auth/RegisterProForm.tsx`

Currently only `tErrors = useTranslations('errors')` exists.

- [ ] **Step 1: Add the `auth` translator** — after `const tErrors = useTranslations('errors');` add:

```tsx
const t = useTranslations('auth');
```

- [ ] **Step 2: Replace literals** — apply this exact mapping (reuse existing `auth.fullName`/`auth.email`):

| Location                                   | Before                                     | After                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| AlertTitle (submitted view)                | `Submitted`                                | `{t('proSubmittedTitle')}`                                                                                                              |
| Submitted body (full `<AlertDescription>`) | the hardcoded sentence with `{adminEmail}` | `{t('longCopy.proSignupPending', { email: adminEmail })}` (replace the whole text node; drop the inline `<span className="font-mono">`) |
| `<h2>`                                     | `Firm`                                     | `{t('firmSection')}`                                                                                                                    |
| Label firm-name                            | `Firm name`                                | `{t('firmName')}`                                                                                                                       |
| Label firm-plan                            | `Plan`                                     | `{t('plan')}`                                                                                                                           |
| `<h2>`                                     | `Your account`                             | `{t('yourAccount')}`                                                                                                                    |
| Label admin-name                           | `Full name`                                | `{t('fullName')}`                                                                                                                       |
| Label admin-email                          | `Email`                                    | `{t('email')}`                                                                                                                          |
| Label admin-phone                          | `Phone (E.164)`                            | `{t('phoneE164')}`                                                                                                                      |
| Submit button pending text                 | `Submitting…`                              | `{t('submittingReview')}`                                                                                                               |
| Submit button idle text                    | `'Submit for review'`                      | `{t('submitForReview')}`                                                                                                                |

The submitted-view `AlertDescription` becomes:

```tsx
<AlertDescription>{t('longCopy.proSignupPending', { email: adminEmail })}</AlertDescription>
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run lint` no new warnings.

---

## Task 5: Wire `ProfileGeneralForm`

**Files:**

- Modify: `src/components/account/ProfileGeneralForm.tsx`

`t = useTranslations('account')`, `tCommon`, `tShell` already exist.

- [ ] **Step 1: Card titles / descriptions** — apply mapping:

| Before                                                          | After                               |
| --------------------------------------------------------------- | ----------------------------------- |
| `Read-only details from your account record.` (CardDescription) | `{t('longCopy.readOnlyDetails')}`   |
| `Identity` (CardTitle)                                          | `{t('identitySection')}`            |
| `How your name and avatar appear across the platform.`          | `{t('longCopy.identityHelp')}`      |
| `Contact & Locale`                                              | `{t('contactLocaleSection')}`       |
| `Phone, language, timezone, and date format.`                   | `{t('longCopy.contactLocaleHelp')}` |
| `About`                                                         | `{t('aboutSection')}`               |
| `A short bio shown on your profile.`                            | `{t('longCopy.aboutHelp')}`         |

- [ ] **Step 2: Select prompts & bio** — replace prose placeholders:

| Before                                          | After                                 |
| ----------------------------------------------- | ------------------------------------- |
| `placeholder="Select language"`                 | `placeholder={t('selectLanguage')}`   |
| `placeholder="Select timezone"`                 | `placeholder={t('selectTimezone')}`   |
| `placeholder="Select date format"`              | `placeholder={t('selectDateFormat')}` |
| `placeholder="A few sentences about yourself…"` | `placeholder={t('bioPlaceholder')}`   |
| `Markdown not supported.` (`<span>`)            | `{t('markdownNotSupported')}`         |

Leave literal (per exclusions): `placeholder="https://example.com/me.jpg"`, `placeholder="harman_admin"`, `placeholder="Platform Administrator"`, `placeholder="+971501234567"`, and `LOCALE_LABELS`/`DATE_FORMAT_LABELS`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run lint` no new warnings.

---

## Task 6: Wire `CreateClientForm`

**Files:**

- Modify: `src/components/pro/CreateClientForm.tsx`

`t = useTranslations('pro')` already exists.

- [ ] **Step 1: Replace the dialog description** (lines ~76-78):

```tsx
<DialogDescription>{t('newClientIntro')}</DialogDescription>
```

Leave placeholders `Acme Trading LLC`, `DED-123456`, `Dubai Mainland` literal (format examples).

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run lint` no new warnings.

---

## Task 7: Wire `NewRenewalDialog`

**Files:**

- Modify: `src/components/pro/NewRenewalDialog.tsx`

`t = useTranslations('pro')` already exists.

- [ ] **Step 1: Replace description and label placeholder**

| Before                                        | After                                        |
| --------------------------------------------- | -------------------------------------------- |
| DialogDescription text (lines ~108-111)       | `{t('newRenewalIntro')}`                     |
| `placeholder="e.g. Investor visa — Mr. Khan"` | `placeholder={t('renewalLabelPlaceholder')}` |

Leave `setError('INVALID_INPUT: select a client')` literal (dev-prefixed contract string, per exclusions).

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run lint` no new warnings.

---

## Task 8: Wire `UploadDocumentDialog`

**Files:**

- Modify: `src/components/customer/UploadDocumentDialog.tsx`

`t = useTranslations('customer')`, `tCommon`, `tErrors = useTranslations('errors')` already exist.

- [ ] **Step 1: Replace the two client-side guard messages** (lines ~52, ~56):

```tsx
setError(tErrors('pickFileFirst'));
// ...
setError(tErrors('longCopy.uploadTooLarge'));
```

(`errors.longCopy.uploadTooLarge` already exists = "That file is larger than the 25 MB limit. Please compress it or upload it in smaller parts.")

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run lint` no new warnings.

---

## Task 9: Commit 1 gate — verify + browser smoke + commit

**Files:** all from Tasks 1-8.

- [ ] **Step 1: Typecheck + lint**

Run: `npx tsc --noEmit` → exit 0. `npm run lint` → 0 errors, no new warnings vs baseline (baseline = 4 pre-existing react-hook-form `watch` warnings in `CreateUserForm.tsx` + `RegisterForm.tsx`).

- [ ] **Step 2: JSON key parity**

Run the parity command from Task 1 Step 4. Expected: `PARITY OK`.

- [ ] **Step 3: Browser smoke (dev server must be running on :3000)**

Using `agent-browser` (via `npx --no-install agent-browser`), for each route below: open it, run `list_console_messages`, confirm **no** `MISSING_MESSAGE` / `IntlError` entries, and confirm the touched labels render. Then toggle to Arabic via the Language switcher and re-check the same route for missing-key errors + RTL.

Routes:

- `/register` (RegisterForm)
- `/register/pro` (RegisterProForm)
- the account profile page hosting `ProfileGeneralForm`
- a pro clients page hosting `CreateClientForm` + a renewals page hosting `NewRenewalDialog` (open each dialog)
- a customer documents page hosting `UploadDocumentDialog` (open dialog, submit empty to trigger `pickFileFirst`)
- `/login` (LoginForm placeholder)

- [ ] **Step 4: Commit**

```bash
git add src/messages/en.json src/messages/ar.json \
  src/components/auth/LoginForm.tsx src/components/auth/RegisterForm.tsx \
  src/components/auth/RegisterProForm.tsx src/components/account/ProfileGeneralForm.tsx \
  src/components/pro/CreateClientForm.tsx src/components/pro/NewRenewalDialog.tsx \
  src/components/customer/UploadDocumentDialog.tsx
git commit -m "feat: internationalize remaining strings in seven auth/account/pro/customer forms

Wire LoginForm, RegisterForm, RegisterProForm, ProfileGeneralForm,
CreateClientForm, NewRenewalDialog, and UploadDocumentDialog to next-intl.
Reuse existing keys (auth.longCopy.consentPdpl, auth.fullName/email,
errors.passwordMismatch, errors.longCopy.uploadTooLarge) and add new
auth/account/pro/errors keys with dev-translated Arabic twins.
Zod schema messages and format-example placeholders left literal.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# COMMIT 2 — QuestionnaireForm

## Task 10: Add the `questionnaire` namespace

**Files:**

- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json`

- [ ] **Step 1: Add a new top-level `questionnaire` namespace to `en.json`**

Insert as a new top-level object (e.g. after `customer`):

```jsonc
"questionnaire": {
  "eyebrow": "Questionnaire",
  "asideEyebrow": "Public application",
  "asideTitle": "Company setup questionnaire",
  "estimatorHandoff": "Estimator handoff",
  "reference": "Reference: {value}",
  "notProvided": "not provided",
  "submissionIssue": "Submission issue",
  "continue": "Continue",
  "submit": "Submit questionnaire",
  "submitting": "Submitting...",
  "steps": {
    "contact": "Contact",
    "business": "Business",
    "setup": "Setup",
    "details": "Ownership",
    "review": "Review"
  },
  "jurisdiction": {
    "mainland": "Mainland",
    "free_zone": "Free Zone",
    "offshore": "Offshore"
  },
  "office": {
    "none": "No office",
    "flexi": "Flexi desk",
    "physical": "Physical office",
    "virtual": "Virtual office"
  },
  "documentReadiness": {
    "ready": "Ready",
    "partial": "Partially ready",
    "not_ready": "Not ready"
  },
  "addOns": {
    "bank_account": "Bank account assistance",
    "tax_registration": "Corporate tax registration",
    "document_attestation": "Document attestation",
    "pro_services": "PRO services"
  },
  "sections": {
    "contactTitle": "Contact details",
    "contactDesc": "Use at least one reachable contact channel.",
    "businessTitle": "Business details",
    "businessDesc": "Keep this concise enough for routing and document preparation.",
    "setupTitle": "Setup preferences",
    "setupDesc": "Estimator values are prefilled when present in the URL.",
    "detailsTitle": "Ownership, visas, and office",
    "detailsDesc": "Only the conditional fields needed for this setup are shown.",
    "reviewTitle": "Review and submit",
    "reviewDesc": "Confirm the summary before creating the anonymous lead."
  },
  "fields": {
    "fullName": "Full name",
    "nationality": "Nationality",
    "email": "Email",
    "phone": "Phone",
    "activity": "Business activity",
    "preferredNames": "Preferred company names",
    "nameOption": "Option {index}",
    "businessSummary": "Business summary",
    "jurisdiction": "Jurisdiction",
    "authority": "Authority",
    "documentReadiness": "Document readiness",
    "addOns": "Add-ons",
    "shareholderCount": "Shareholder count",
    "officeType": "Office type",
    "shareholderSplit": "Shareholder split",
    "addVisas": "Add residence visas to this setup",
    "investorVisas": "Investor visas",
    "employeeVisas": "Employee visas",
    "familyVisas": "Family visas",
    "officeNotes": "Office notes",
    "additionalNotes": "Additional notes"
  },
  "review": {
    "contact": "Contact",
    "business": "Business",
    "setup": "Setup",
    "ownership": "Ownership",
    "visas": "Visas",
    "office": "Office",
    "notSet": "Not set",
    "noNamesYet": "No names yet",
    "authorityPending": "Authority pending",
    "shareholders": "{count, plural, one {# shareholder} other {# shareholders}}",
    "visasRequested": "{count} requested"
  },
  "success": {
    "eyebrow": "Application received",
    "leadReference": "Lead reference {leadId}",
    "queued": "Your questionnaire is queued for review. Current stage: {stage}."
  }
}
```

- [ ] **Step 2: Add the dev-translated Arabic twin** to `ar.json` — identical key structure, Arabic values. Example values:

```jsonc
"questionnaire": {
  "eyebrow": "الاستبيان",
  "asideEyebrow": "طلب عام",
  "asideTitle": "استبيان تأسيس الشركة",
  "estimatorHandoff": "تسليم من المُقدِّر",
  "reference": "المرجع: {value}",
  "notProvided": "غير متوفر",
  "submissionIssue": "مشكلة في الإرسال",
  "continue": "متابعة",
  "submit": "إرسال الاستبيان",
  "submitting": "جارٍ الإرسال...",
  "steps": { "contact": "التواصل", "business": "النشاط", "setup": "الإعداد", "details": "الملكية", "review": "المراجعة" },
  "jurisdiction": { "mainland": "البر الرئيسي", "free_zone": "المنطقة الحرة", "offshore": "أوفشور" },
  "office": { "none": "بدون مكتب", "flexi": "مكتب مرن", "physical": "مكتب فعلي", "virtual": "مكتب افتراضي" },
  "documentReadiness": { "ready": "جاهزة", "partial": "جاهزة جزئيًا", "not_ready": "غير جاهزة" },
  "addOns": { "bank_account": "المساعدة في فتح حساب بنكي", "tax_registration": "تسجيل ضريبة الشركات", "document_attestation": "تصديق المستندات", "pro_services": "خدمات العلاقات الحكومية" },
  "sections": {
    "contactTitle": "تفاصيل التواصل",
    "contactDesc": "استخدم قناة تواصل واحدة قابلة للوصول على الأقل.",
    "businessTitle": "تفاصيل النشاط",
    "businessDesc": "اجعلها موجزة بما يكفي للتوجيه وتحضير المستندات.",
    "setupTitle": "تفضيلات الإعداد",
    "setupDesc": "تُملأ قيم المُقدِّر مسبقًا عند توفرها في الرابط.",
    "detailsTitle": "الملكية والتأشيرات والمكتب",
    "detailsDesc": "تظهر فقط الحقول الشرطية اللازمة لهذا الإعداد.",
    "reviewTitle": "المراجعة والإرسال",
    "reviewDesc": "أكّد الملخص قبل إنشاء العميل المحتمل المجهول."
  },
  "fields": {
    "fullName": "الاسم الكامل", "nationality": "الجنسية", "email": "البريد الإلكتروني", "phone": "الهاتف",
    "activity": "النشاط التجاري", "preferredNames": "أسماء الشركة المفضلة", "nameOption": "خيار {index}",
    "businessSummary": "ملخص النشاط", "jurisdiction": "الولاية", "authority": "الجهة",
    "documentReadiness": "جاهزية المستندات", "addOns": "إضافات", "shareholderCount": "عدد المساهمين",
    "officeType": "نوع المكتب", "shareholderSplit": "توزيع الحصص", "addVisas": "إضافة تأشيرات إقامة لهذا الإعداد",
    "investorVisas": "تأشيرات المستثمرين", "employeeVisas": "تأشيرات الموظفين", "familyVisas": "تأشيرات العائلة",
    "officeNotes": "ملاحظات المكتب", "additionalNotes": "ملاحظات إضافية"
  },
  "review": {
    "contact": "التواصل", "business": "النشاط", "setup": "الإعداد", "ownership": "الملكية", "visas": "التأشيرات", "office": "المكتب",
    "notSet": "غير محدد", "noNamesYet": "لا أسماء بعد", "authorityPending": "الجهة قيد التحديد",
    "shareholders": "{count, plural, zero {# مساهم} one {# مساهم} two {# مساهمان} few {# مساهمين} many {# مساهمًا} other {# مساهم}}",
    "visasRequested": "{count} مطلوبة"
  },
  "success": {
    "eyebrow": "تم استلام الطلب",
    "leadReference": "مرجع العميل المحتمل {leadId}",
    "queued": "استبيانك في قائمة المراجعة. المرحلة الحالية: {stage}."
  }
}
```

- [ ] **Step 3: Verify parity** — run the parity command from Task 1 Step 4. Expected: `PARITY OK`.

---

## Task 11: Refactor `QuestionnaireForm` to use `t()`

**Files:**

- Modify: `src/components/questionnaire/QuestionnaireForm.tsx`

- [ ] **Step 1: Add the `questionnaire` translator**

In the component body, after `const tErrors = useTranslations('errors');` (line ~114) add:

```tsx
const t = useTranslations('questionnaire');
```

- [ ] **Step 2: Strip labels from module-scope option arrays** — keep `value` only.

```tsx
const JURISDICTION_OPTIONS = [
  { value: 'mainland' },
  { value: 'free_zone' },
  { value: 'offshore' },
] as const;

const OFFICE_OPTIONS = [
  { value: 'none' },
  { value: 'flexi' },
  { value: 'physical' },
  { value: 'virtual' },
] as const;

const DOCUMENT_OPTIONS = [
  { value: 'ready' },
  { value: 'partial' },
  { value: 'not_ready' },
] as const;

const ADD_ONS = [
  { value: 'bank_account' },
  { value: 'tax_registration' },
  { value: 'document_attestation' },
  { value: 'pro_services' },
] as const;
```

In `STEPS`, remove the `label` field from the type and each entry (keep `id`, `icon`, `fields`). The type becomes:

```tsx
const STEPS: {
  id: StepId;
  icon: typeof ClipboardList;
  fields: (keyof QuestionnaireAnswers)[];
}[] = [
  { id: 'contact', icon: ClipboardList, fields: ['fullName', 'email', 'phone', 'nationality'] },
  { id: 'business', icon: Building2, fields: ['activity', 'preferredNames', 'businessSummary'] },
  {
    id: 'setup',
    icon: FileCheck2,
    fields: ['jurisdiction', 'authority', 'addOns', 'documentReadiness'],
  },
  {
    id: 'details',
    icon: Users,
    fields: [
      'shareholderCount',
      'shareholderSplitSummary',
      'investorVisaCount',
      'employeeVisaCount',
      'familyVisaCount',
      'officeType',
      'officeAreaNotes',
    ],
  },
  { id: 'review', icon: CheckCircle2, fields: ['notes'] },
];
```

- [ ] **Step 3: Remove the `labelFor` helper** (lines ~659-664) — it depended on `.label`. Replace its two call sites in `reviewRows` (Step 4).

- [ ] **Step 4: Rebuild `reviewRows`** (lines ~130-149) using `t()`:

```tsx
const reviewRows = useMemo(
  () => [
    [
      t('review.contact'),
      [answers.fullName, answers.email || answers.phone].filter(Boolean).join(' / '),
    ],
    [
      t('review.business'),
      `${answers.activity || t('review.notSet')} · ${answers.preferredNames.filter(Boolean).join(', ') || t('review.noNamesYet')}`,
    ],
    [
      t('review.setup'),
      `${t(`jurisdiction.${answers.jurisdiction}`)} · ${answers.authority || t('review.authorityPending')}`,
    ],
    [t('review.ownership'), t('review.shareholders', { count: answers.shareholderCount })],
    [t('review.visas'), t('review.visasRequested', { count: requestedVisaCount(answers) })],
    [t('review.office'), t(`office.${answers.officeType}`)],
  ],
  [answers, t],
);
```

- [ ] **Step 5: Replace option-array render labels**

- Jurisdiction `<SelectItem>` (line ~393): `{item.label}` → `{t(\`jurisdiction.${item.value}\`)}`
- Document `<SelectItem>` (line ~418): `{item.label}` → `{t(\`documentReadiness.${item.value}\`)}`
- Office `<SelectItem>` (line ~470): `{item.label}` → `{t(\`office.${item.value}\`)}`
- Add-ons label (line ~434): `{addOn.label}` → `{t(\`addOns.${addOn.value}\`)}`

- [ ] **Step 6: Replace step sidebar + aside + success + alert literals**

| Location                            | Before                                                          | After                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| sidebar step label (line ~274)      | `{step.label}`                                                  | `{t(\`steps.${step.id}\`)}`                                                                           |
| aside eyebrow (line ~245)           | `Public application`                                            | `{t('asideEyebrow')}`                                                                                 |
| aside h1 (line ~246-248)            | `Company setup questionnaire`                                   | `{t('asideTitle')}`                                                                                   |
| estimator handoff title (line ~282) | `Estimator handoff`                                             | `{t('estimatorHandoff')}`                                                                             |
| estimator reference (line ~284)     | `Reference: {String(estimateData.reference ?? 'not provided')}` | `{t('reference', { value: String(estimateData.reference ?? t('notProvided')) })}`                     |
| submission alert title (line ~294)  | `Submission issue`                                              | `{t('submissionIssue')}`                                                                              |
| success eyebrow (line ~227)         | `Application received`                                          | `{t('success.eyebrow')}`                                                                              |
| success h1 (line ~228-230)          | `Lead reference {success.leadId}`                               | `{t('success.leadReference', { leadId: success.leadId })}`                                            |
| success body (line ~231-234)        | the queued sentence with `{success.stage}`                      | `{t('success.queued', { stage: success.stage })}` (replace whole text node incl. the inline `<span>`) |
| StepSection eyebrow (line ~617)     | `Questionnaire`                                                 | `{t('eyebrow')}`                                                                                      |

Note: `StepSection` is a module-scope sub-component; the eyebrow "Questionnaire" must be passed in or resolved. Simplest: pass an `eyebrow` prop. Update `StepSection` signature to accept `eyebrow: string` and render it, and pass `eyebrow={t('eyebrow')}` at all 5 call sites. Alternatively (preferred, fewer edits): give `StepSection` its own `const t = useTranslations('questionnaire')` and use `{t('eyebrow')}` directly inside it. Use the latter.

- [ ] **Step 7: Replace section titles/descriptions at the 5 `StepSection` call sites**

| Step     | title→                        | description→                 |
| -------- | ----------------------------- | ---------------------------- |
| contact  | `t('sections.contactTitle')`  | `t('sections.contactDesc')`  |
| business | `t('sections.businessTitle')` | `t('sections.businessDesc')` |
| setup    | `t('sections.setupTitle')`    | `t('sections.setupDesc')`    |
| details  | `t('sections.detailsTitle')`  | `t('sections.detailsDesc')`  |
| review   | `t('sections.reviewTitle')`   | `t('sections.reviewDesc')`   |

- [ ] **Step 8: Replace `Field` labels** — `Field` is module-scope and takes a `label: string` prop. Pass already-translated strings from the call sites (do NOT make `Field` call `t`). Apply at each `<Field label="...">`:

| Before                            | After                                   |
| --------------------------------- | --------------------------------------- |
| `label="Full name"`               | `label={t('fields.fullName')}`          |
| `label="Nationality"`             | `label={t('fields.nationality')}`       |
| `label="Email"`                   | `label={t('fields.email')}`             |
| `label="Phone"`                   | `label={t('fields.phone')}`             |
| `label="Business activity"`       | `label={t('fields.activity')}`          |
| `label="Preferred company names"` | `label={t('fields.preferredNames')}`    |
| `label="Business summary"`        | `label={t('fields.businessSummary')}`   |
| `label="Jurisdiction"`            | `label={t('fields.jurisdiction')}`      |
| `label="Authority"`               | `label={t('fields.authority')}`         |
| `label="Document readiness"`      | `label={t('fields.documentReadiness')}` |
| `label="Shareholder count"`       | `label={t('fields.shareholderCount')}`  |
| `label="Office type"`             | `label={t('fields.officeType')}`        |
| `label="Shareholder split"`       | `label={t('fields.shareholderSplit')}`  |
| `label="Investor visas"`          | `label={t('fields.investorVisas')}`     |
| `label="Employee visas"`          | `label={t('fields.employeeVisas')}`     |
| `label="Family visas"`            | `label={t('fields.familyVisas')}`       |
| `label="Office notes"`            | `label={t('fields.officeNotes')}`       |
| `label="Additional notes"`        | `label={t('fields.additionalNotes')}`   |

Also the inner per-name option `<Label>` (line ~354): `Option {index + 1}` → `{t('fields.nameOption', { index: index + 1 })}`. And the add-ons group `<Label>` (line ~426): `Add-ons` → `{t('fields.addOns')}`. And the visa checkbox text (line ~501): `Add residence visas to this setup` → `{t('fields.addVisas')}`.

- [ ] **Step 9: Replace nav buttons**

| Before                               | After                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Back` (line ~582)                   | `{t('steps') ? null : null}` — use shared `common.back`: add `const tCommon = useTranslations('common');` and render `{tCommon('back')}` |
| `'Submitting...'` (line ~591)        | `{t('submitting')}`                                                                                                                      |
| `'Submit questionnaire'` (line ~591) | `{t('submit')}`                                                                                                                          |
| `Continue` (line ~595)               | `{t('continue')}`                                                                                                                        |

Add `const tCommon = useTranslations('common');` near the other hooks; the "Back" button text becomes `{tCommon('back')}`.

- [ ] **Step 10: Fix the module-scope `apiErrorsToFieldErrors` fallback** (lines ~681-702) — it hardcodes `'Could not submit the questionnaire.'` twice and can't call `t`. Add a `fallback: string` parameter and pass `tErrors('questionnaireSubmitFailed')` from the call site.

Change signature: `function apiErrorsToFieldErrors(body: unknown, fallback: string): QuestionnaireFieldErrors {` and replace both literal `'Could not submit the questionnaire.'` with `fallback`. At the call site (line ~207): `setFieldErrors(apiErrorsToFieldErrors(body, tErrors('questionnaireSubmitFailed')));`

- [ ] **Step 11: Verify** — `npx tsc --noEmit` clean; `npm run lint` no new warnings. Confirm no remaining `.label` references and that `labelFor` is fully removed (no dangling references).

Run: `grep -n "label:" src/components/questionnaire/QuestionnaireForm.tsx` → expect no option-array `label:` lines remain. `grep -n "labelFor" src/components/questionnaire/QuestionnaireForm.tsx` → expect no matches.

---

## Task 12: Commit 2 gate — verify + browser smoke + commit

- [ ] **Step 1: Typecheck + lint** — `npx tsc --noEmit` exit 0; `npm run lint` no new warnings.

- [ ] **Step 2: JSON parity** — parity command from Task 1 Step 4 → `PARITY OK`.

- [ ] **Step 3: Browser smoke** — dev server on :3000. Open the public questionnaire route (the page rendering `QuestionnaireForm`, e.g. the public company-setup application route). Walk all 5 steps: confirm sidebar step names, section titles/descriptions, field labels, jurisdiction/office/document/add-on options, and the Back/Continue/Submit buttons render. Submit a complete form to hit the success view; confirm "Application received" + lead reference render. Check `list_console_messages` for zero `MISSING_MESSAGE`/`IntlError`. Toggle to Arabic; repeat the walk; confirm Arabic strings + RTL, no missing-key errors, and the shareholder plural renders.

- [ ] **Step 4: Commit**

```bash
git add src/messages/en.json src/messages/ar.json \
  src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "feat: internationalize QuestionnaireForm via new questionnaire namespace

Move step/jurisdiction/office/document/add-on labels out of module-scope
arrays (keep stable value/id, resolve labels via t() in-component), and
route all section titles, field labels, review summary, success view, and
nav buttons through next-intl. Add questionnaire namespace with
dev-translated Arabic twins. Reuse common.back for the Back button.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Task-3 handoff artifact

- [ ] **Step 1: Emit the new-key worklist for native Arabic review**

Produce a flat list of every key added in Tasks 1, 3, and 10 (namespace.path), grouped by namespace, and append it to the daily report's task-3 line (or a `Reports/i18n-task3-keys.md` file). This is the native reviewer's exact worklist. Roughly: ~17 `auth.*`, ~12 `account.*`, ~4 `pro.*`/`errors.*`, ~60 `questionnaire.*`.

- [ ] **Step 2: Update docs** — per CLAUDE.md §13: no API/flow/route change. Update `Reports/daily-work-report.md`: move task 2 to Work Completed, note files + namespaces, mark task 3 unblocked with the key list. State in the task summary which files changed.

---

## Self-review notes (author)

- **Spec coverage:** all 8 files have tasks; new `questionnaire` namespace (Task 10); module-scope array pattern (Task 11 Steps 2-5); Arabic twins every key task; placeholder policy (exclusions + per-file steps); two-commit delivery (Tasks 9, 12); handoff (Task 13). ✓
- **Reuse verified against current en.json:** `auth.longCopy.consentPdpl`, `auth.fullName/email`, `errors.passwordMismatch`, `errors.longCopy.uploadTooLarge`, `common.back/cancel/saving` confirmed present. ✓
- **Type consistency:** `PasswordRule` gains `labelKey` (Task 3); `STEPS`/option arrays drop `label`, `labelFor` removed, all consumers updated (Task 11); `apiErrorsToFieldErrors` gains `fallback` param with call site updated. ✓
- **Plural:** `review.shareholders` uses ICU plural; Arabic provides plural categories. Verify next-intl ICU plural is enabled (default in next-intl) during Task 11 smoke.
