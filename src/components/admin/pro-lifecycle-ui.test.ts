import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { formatProCommercialDate } from './pro-lifecycle-ui';
import { formatProRegistryDate } from './pro-registry-format';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

test('PRO mode reuses Users page with exact count, applied filters, reset, and deterministic pages', () => {
  const page = read('src/app/admin/users/page.tsx');
  assert.match(page, /sp\.role === 'pro'/u);
  assert.match(page, /Array\.isArray\(sp\.role\)/u);
  assert.match(page, /listProRegistry/u);
  assert.match(page, /total/u);
  assert.match(page, /ProRegistryAppliedFilters/u);
  assert.match(page, /ProRegistryPagination/u);
  assert.match(page, /ProRegistryEmptyState[\s\S]*filtersActive/u);
  assert.match(page, /canonicalProRegistryPage/u);
  assert.match(page, /redirect\(buildProRegistryHref\(filters, \{ page: canonicalPage \}\)\)/u);
});

test('PRO registry dates use explicit locale and Dubai timezone', () => {
  const iso = '2026-08-01T22:30:00.000Z';
  assert.equal(
    formatProRegistryDate(iso, 'en'),
    new Intl.DateTimeFormat('en-AE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Dubai',
    }).format(new Date(iso)),
  );
  assert.equal(
    formatProRegistryDate(iso, 'ar'),
    new Intl.DateTimeFormat('ar-AE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Dubai',
    }).format(new Date(iso)),
  );
  const table = read('src/components/admin/ProRegistryTable.tsx');
  assert.match(table, /getLocale/u);
  assert.match(table, /formatProRegistryDate/u);
  assert.doesNotMatch(table, /slice\(0, 10\)/u);
});

test('PRO registry table links to detail and exposes semantic sorting plus narrow scroll', () => {
  const table = read('src/components/admin/ProRegistryTable.tsx');
  assert.match(table, /aria-sort/u);
  assert.match(table, /\/admin\/users\/\$\{row\.id\}/u);
  assert.doesNotMatch(table, /\/edit/u);
  assert.match(table, /role="region"/u);
  assert.match(table, /aria-label/u);
  assert.match(table, /overflow-x-auto/u);
});

test('generic user rows retain edit links while PRO rows never paginate in client memory', () => {
  assert.match(read('src/components/admin/UsersTable.tsx'), /\/admin\/users\/\$\{r\.id\}\/edit/u);
  const registry = read('src/lib/data/pro-registry.ts');
  assert.equal((registry.match(/\.rpc\(/gu) ?? []).length, 1);
  assert.doesNotMatch(registry, /auth\.admin|\.slice\(|getUserById|listUsers/u);
});

test('operator lifecycle detail uses server composition with one heading and focused client forms', () => {
  const page = read('src/app/admin/users/[id]/page.tsx');
  assert.equal((page.match(/<h1\b/gu) ?? []).length, 1);
  assert.match(page, /ProCredentialPanel/u);
  assert.match(page, /ProCommercialTermsPanel/u);
  assert.match(page, /ProLifecycleTimeline/u);
  assert.match(page, /searchParams/u);
  assert.match(page, /readProLifecycleTimeline/u);
  assert.doesNotMatch(page, /^['"]use client['"]/mu);
});

test('credential surface is masked-only, semantic, evidence-owned, and exposes legal transitions', () => {
  const panel = read('src/components/admin/ProCredentialPanel.tsx');
  const form = read('src/components/admin/ProCredentialReviewForm.tsx');
  const statuses = read('src/components/admin/ProLifecycleStatusBadge.tsx');
  assert.match(panel, /<dl/u);
  assert.match(panel, /maskedIdentifier/u);
  assert.match(panel, /dir="ltr"/u);
  assert.match(panel, /evidence\/\$\{item\.evidenceId\}/u);
  assert.match(panel, /originalNameSafe/u);
  assert.doesNotMatch(panel, /identifierCiphertext|identifierHash|storagePath|sha256/u);
  assert.match(form, /LEGAL_CREDENTIAL_COMMANDS/u);
  assert.match(form, /submitted:\s*\['begin_review'\]/u);
  assert.match(form, /under_review:\s*\['verify', 'reject'\]/u);
  assert.match(form, /verified:\s*\['revoke'\]/u);
  assert.match(form, /<fieldset/u);
  assert.match(form, /<legend/u);
  assert.match(form, /<Label/u);
  assert.match(form, /reason/u);
  assert.match(form, /revokeConfirmation/u);
  assert.match(form, /claimFormSubmission/u);
  assert.match(form, /aria-live="polite"/u);
  assert.match(form, /errorRef\.current\?\.focus/u);
  assert.match(form, /router\.refresh/u);
  assert.match(form, /try\s*\{[\s\S]*await postJson/u);
  assert.match(form, /catch\s*\{[\s\S]*setError\(t\('failed'\)\)/u);
  assert.match(
    form,
    /finally\s*\{[\s\S]*setPending\(false\)[\s\S]*releaseFormSubmission\(latch\)/u,
  );
  assert.doesNotMatch(form, />\s*(Begin review|Verify|Reject|Revoke|Reason)\s*</u);
  for (const [state, icon] of [
    ['draft', 'FilePenLine'],
    ['submitted', 'Send'],
    ['under_review', 'FileSearch'],
    ['verified', 'ShieldCheck'],
    ['rejected', 'ShieldX'],
    ['revoked', 'Ban'],
  ]) {
    assert.match(statuses, new RegExp(`${state}:\\s*${icon}`, 'u'));
  }
  assert.match(statuses, /aria-hidden/u);
  assert.match(panel, /ProCredentialStatusBadge/u);
  assert.match(panel, /t\(`credentialStates\.\$\{credential\.state\}`\)/u);
});

test('commercial surfaces use mandated labels and disclaim money execution', () => {
  const panel = read('src/components/admin/ProCommercialTermsPanel.tsx');
  const form = read('src/components/admin/ProCommercialTermForm.tsx');
  const statuses = read('src/components/admin/ProLifecycleStatusBadge.tsx');
  const en = JSON.parse(read('src/messages/en.json')) as {
    admin: {
      user: {
        proLifecycle: {
          terms: { pricingTitle: string; compensationTitle: string; disclaimer: string };
        };
      };
    };
  };
  const copy = en.admin.user.proLifecycle;
  assert.equal(copy.terms.pricingTitle, 'company-facing PRO service price');
  assert.equal(copy.terms.compensationTitle, 'PRO compensation term');
  assert.match(copy.terms.disclaimer, /not earned, payable, or paid money/u);
  assert.match(panel, /<dl/u);
  assert.match(panel, /terms\.disclaimer/u);
  assert.match(form, /<fieldset/u);
  assert.match(form, /<legend/u);
  assert.match(form, /claimFormSubmission/u);
  assert.match(form, /aria-live="polite"/u);
  assert.match(form, /errorRef\.current\?\.focus/u);
  assert.match(form, /try\s*\{[\s\S]*await postJson/u);
  assert.match(form, /catch\s*\{[\s\S]*setError\(t\('failed'\)\)/u);
  assert.match(
    form,
    /finally\s*\{[\s\S]*setPending\(false\)[\s\S]*releaseFormSubmission\(latch\)/u,
  );
  assert.match(panel, /const active = matches\.find\(\(term\) => term\.status === 'active'\)/u);
  assert.match(panel, /const draft = matches\.find\(\(term\) => term\.status === 'draft'\)/u);
  assert.match(panel, /\[active, draft\]/u);
  assert.match(panel, /ProCommercialTermForm[\s\S]*term=\{current\}/u);
  assert.match(form, /variant=\{mode === 'end' \? 'outline' : 'default'\}/u);
  assert.match(statuses, /draft:\s*FilePenLine/u);
  assert.match(statuses, /active:\s*CircleCheck/u);
  assert.match(statuses, /ended:\s*CalendarX2/u);
  assert.match(panel, /ProTermStatusBadge/u);
  assert.match(panel, /t\(`terms\.statuses\.\$\{current\.status\}`\)/u);
  assert.match(panel, /formatProCommercialDate/u);
  assert.match(panel, /term\.effectiveTo/u);
  assert.match(panel, /term\.retainerInterval/u);
  assert.match(panel, /term\.version/u);
  assert.doesNotMatch(form, />\s*(Amount|Model|Activate|End|Save)\s*</u);
});

test('active term without a draft offers one primary replacement-draft action', () => {
  const panel = read('src/components/admin/ProCommercialTermsPanel.tsx');
  const form = read('src/components/admin/ProCommercialTermForm.tsx');
  assert.match(panel, /!draft[\s\S]*ProCommercialTermForm[\s\S]*term=\{null\}/u);
  assert.match(panel, /\[active, draft\][\s\S]*term=\{current\}/u);
  assert.match(form, /variant=\{mode === 'end' \? 'outline' : 'default'\}/u);
});

test('commercial dates use explicit locale and Dubai timezone', () => {
  const date = '2026-08-01';
  for (const [locale, tag] of [
    ['en', 'en-AE'],
    ['ar', 'ar-AE'],
  ] as const) {
    assert.equal(
      formatProCommercialDate(date, locale),
      new Intl.DateTimeFormat(tag, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Dubai',
      }).format(new Date(`${date}T12:00:00.000Z`)),
    );
  }
});

test('timeline is semantic, localized, deterministic, and preserves validated cursor paging', () => {
  const timeline = read('src/components/admin/ProLifecycleTimeline.tsx');
  const page = read('src/app/admin/users/[id]/page.tsx');
  assert.match(timeline, /<ol/u);
  assert.match(timeline, /eventKind/u);
  assert.match(timeline, /actorDisplayName \?\?/u);
  assert.match(timeline, /companyDisplayName \?\?/u);
  assert.match(timeline, /reasonCode/u);
  assert.match(timeline, /reason/u);
  assert.match(timeline, /formatProLifecycleTimestamp/u);
  assert.doesNotMatch(timeline, />\s*(Timeline|Unavailable|Load more)\s*</u);
  assert.match(page, /parseProTimelineSearchParams/u);
  assert.match(timeline, /buildProTimelineHref/u);
  assert.match(timeline, /availableTimeline\.nextCursor/u);
});

test('generic PRO edit links to lifecycle detail and contains no credential input or value', () => {
  const panel = read('src/components/admin/EditUserPanel.tsx');
  const fields = read('src/components/admin/EditUserForm.tsx');
  assert.match(panel, /\/admin\/users\/\$\{profile\.id\}/u);
  assert.doesNotMatch(panel, /maskedIdentifier|credentialSummary|VerifyProCredentialsButton/u);
  assert.doesNotMatch(fields, /licenseNo|credential|identifier/u);
});

test('lifecycle surfaces expose independent partial-source recovery and complete accessible states', () => {
  const page = read('src/app/admin/users/[id]/page.tsx');
  const credential = read('src/components/admin/ProCredentialPanel.tsx');
  const terms = read('src/components/admin/ProCommercialTermsPanel.tsx');
  const timeline = read('src/components/admin/ProLifecycleTimeline.tsx');
  assert.match(page, /Promise\.allSettled/u);
  assert.match(page, /credentialState/u);
  assert.match(page, /termsState/u);
  assert.match(page, /timelineState/u);
  for (const source of [credential, terms, timeline]) {
    assert.match(source, /kind:\s*'ready'[\s\S]*kind:\s*'error'/u);
    assert.match(source, /role="status"/u);
    assert.match(source, /aria-live="polite"/u);
    assert.match(source, /min-h-11/u);
  }
  assert.match(terms, /role="region"/u);
  assert.match(terms, /tabIndex=\{0\}/u);
  assert.match(timeline, /dir=\{locale === 'ar' \? 'rtl' : 'ltr'\}/u);
  assert.doesNotMatch(timeline, /\.reverse\(/u);
});

test('registry distinguishes empty, no-results, partial-email, loading, and sanitized error states', () => {
  const page = read('src/app/admin/users/page.tsx');
  const loading = read('src/app/admin/users/loading.tsx');
  const error = read('src/app/admin/users/error.tsx');
  assert.match(page, /ProRegistryEmptyState/u);
  assert.match(page, /filtersActive/u);
  assert.match(loading, /aria-live="polite"/u);
  assert.match(loading, /h-\[25rem\]/u);
  assert.match(error, /errorDescription/u);
  assert.doesNotMatch(error, /error\.message|error\.stack/u);
  assert.match(page, /partialEmail/u);
});
