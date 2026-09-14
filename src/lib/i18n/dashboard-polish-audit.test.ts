import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('Admin signup chart exposes equivalent values, locale formatting, stable IDs, and no motion', () => {
  const chart = source('components/admin/SignupsChart.tsx');
  assert.match(chart, /useId/u);
  assert.match(chart, /useLocale/u);
  assert.match(chart, /<table/u);
  assert.match(chart, /<caption/u);
  assert.match(chart, /isAnimationActive=\{false\}/u);
  assert.doesNotMatch(chart, /id="signupsFill"/u);
  assert.doesNotMatch(chart, /'en-US'/u);
});

test('status presentation consumes semantic tokens rather than raw utility colors', () => {
  for (const path of [
    'components/customer/RenewalsTimeline.tsx',
    'components/customer/UpcomingRenewalsCard.tsx',
    'components/pro/RenewalBadges.tsx',
    'components/pro/documents/RequestDocumentDialog.tsx',
    'components/admin/StatCard.tsx',
    'components/admin/RecentLoginsTable.tsx',
    'app/(tenant)/t/[tenant]/(customer)/portal/account/erasure/page.tsx',
  ]) {
    const content = source(path);
    assert.doesNotMatch(
      content,
      /(?:emerald|amber|rose|red|green|blue)-(?:50|100|200|300|400|500|600|700|800|900|950)|text-white/u,
      `${path} contains raw status color utilities`,
    );
  }
});

test('Customer erasure presentation is catalogued and does not expose an internal request ID', () => {
  const page = source('app/(tenant)/t/[tenant]/(customer)/portal/account/erasure/page.tsx');
  assert.match(page, /getTranslations\('customer\.erasure'\)/u);
  assert.doesNotMatch(page, /active\.id/u);
  assert.doesNotMatch(
    page,
    />\s*(?:Data erasure|Erased or anonymized|Retained|Recovery email|Reason|Send verification email)\s*</u,
  );
});

test('shared account and PRO settings headings use the canonical catalogs', () => {
  const account = source('app/account/layout.tsx');
  const settings = source('app/(tenant)/t/[tenant]/(pro)/settings/layout.tsx');
  assert.match(account, /getTranslations\('account'\)/u);
  assert.doesNotMatch(account, />My account</u);
  assert.match(settings, /getTranslations\('pro\.settings'\)/u);
  assert.doesNotMatch(settings, />Settings</u);
});

test('PRO payment and meeting actions use catalogued copy without exposing internal diagnostics', () => {
  const invoice = source('components/pro/NewInvoiceDialog.tsx');
  const summary = source('components/pro/MeetingAiSummaryCard.tsx');
  const notice = source('components/pro/SettingsReadOnlyNotice.tsx');
  assert.match(invoice, /useTranslations\('pro'\)/u);
  assert.doesNotMatch(invoice, /result\.code|result\.error/u);
  assert.match(summary, /getTranslations\('meetingOperations\.summary'\)/u);
  assert.doesNotMatch(summary, /summary\.errorCode/u);
  assert.match(notice, /getTranslations\('pro\.settings\.readOnly'\)/u);
});

test('Admin CMS and PRO communications centralize visible copy and sanitize action errors', () => {
  for (const path of [
    'app/admin/blog/page.tsx',
    'app/admin/pages/page.tsx',
    'components/blog/BlogEditor.tsx',
    'components/blog/BlogTaxonomyManager.tsx',
    'components/pages/PageEditor.tsx',
    'components/pages/PagesTable.tsx',
    'components/pro/CommsThread.tsx',
  ]) {
    const content = source(path);
    assert.match(content, /(?:getTranslations|useTranslations)\(/u, `${path} bypasses the catalog`);
    assert.doesNotMatch(content, /result\.(?:code|error)/u, `${path} exposes action diagnostics`);
  }
});

test('PRO collections chart consumes CSS component aliases for theme-aware gradients', () => {
  const chart = source('components/pro/dashboard/CollectionsWaterfall.tsx');
  assert.doesNotMatch(chart, /#[0-9a-f]{3,8}/iu);
  for (const token of [
    '--signal-waterfall-success-start',
    '--signal-waterfall-coral-start',
    '--signal-waterfall-warning-start',
    '--signal-waterfall-urgent-start',
  ]) {
    assert.match(chart, new RegExp(token));
  }
});
