import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('CMS image inputs have accessible names', () => {
  assert.match(source('./blog/BlogMediaPanel.tsx'), /type="file"\s+aria-label=/u);
  assert.match(source('./blog/BlogGalleryManager.tsx'), /type="file"\s+aria-label=/u);
});

test('settings navigation uses link semantics and aria-current', () => {
  for (const path of ['./account/SettingsTabs.tsx', './account/AccountTabs.tsx']) {
    const value = source(path);
    assert.doesNotMatch(value, /role="tab(?:list)?"/u);
    assert.match(value, /aria-current=/u);
  }
});

test('company typeahead does not put aria-required on a button', () => {
  const value = source('./admin/CompanyTypeahead.tsx');
  assert.doesNotMatch(value, /aria-required=\{required\}/u);
  assert.match(value, /data-required=\{required \|\| undefined\}/u);
});

test('lead filters expose accessible names', () => {
  const value = source('../app/admin/leads/page.tsx');
  assert.match(value, /name="assigned"\s+aria-label=/u);
  assert.match(value, /name="stage"\s+aria-label=/u);
});

test('the authenticated admin not-found state retains one main heading', () => {
  const value = source('../app/admin/not-found.tsx');
  assert.match(value, /<h1/u);
  assert.doesNotMatch(value, /\{[^}]*id[^}]*\}/iu);
});

test('nested sidebar links use explicit contrast on the fixed dark shell', () => {
  const value = source('../app/globals.css');
  assert.match(value, /\[data-slot='sidebar-menu-sub-button'\] \{\s+color: #b8b0aa;/u);
  assert.match(
    value,
    /\[data-slot='sidebar-menu-sub-button'\]\[data-active='true'\][^{]*\{\s+color: #ffffff;/u,
  );
});

test('WhatsApp template filters and row status selects have accessible names', () => {
  const value = source('../app/admin/whatsapp-templates/page.tsx');
  const selects = value.match(/<select\b[^>]*>/gu) ?? [];
  assert.equal(selects.length, 3);
  for (const select of selects) assert.match(select, /aria-label=/u);
});

test('the employee table gives its actual inner scroll container labelled keyboard access', () => {
  const value = source('./pro/EmployeeRegistryWorkspace.tsx');
  const table = source('./ui/table.tsx');
  assert.match(table, /scrollAreaLabel\?: string/u);
  assert.match(table, /role=\{scrollAreaLabel \? 'region' : undefined\}/u);
  assert.match(table, /aria-label=\{scrollAreaLabel\}/u);
  assert.match(table, /tabIndex=\{scrollAreaLabel \? 0 : undefined\}/u);
  assert.match(value, /<Table scrollAreaLabel=\{labels\.table\}>/u);
  assert.doesNotMatch(
    value,
    /className="[^"]*overflow-x-auto[^"]*"[\s\S]{0,100}aria-label=\{labels\.table\}/u,
  );
});

test('both Admin Users modes label the shared table scroll container without a nested region', () => {
  const users = source('./admin/UsersTable.tsx');
  const proRegistry = source('./admin/ProRegistryTable.tsx');
  const table = source('./ui/table.tsx');

  assert.match(users, /<Table scrollAreaLabel=\{t\('user\.table\.scrollAreaLabel'\)\}>/u);
  assert.match(proRegistry, /<Table[\s\S]{0,80}scrollAreaLabel=\{t\('tableScrollLabel'\)\}/u);
  assert.match(proRegistry, /containerClassName="border-border\/60 rounded-lg border"/u);
  assert.match(table, /containerClassName\?: string/u);
  assert.match(table, /'relative w-full overflow-x-auto',\s+containerClassName/u);
  assert.doesNotMatch(proRegistry, /<div[\s\S]{0,160}role="region"/u);
});

test('the employee import page does not nest a main landmark inside the dashboard shell', () => {
  const value = source('../app/(tenant)/t/[tenant]/(pro)/employees/import/page.tsx');
  assert.doesNotMatch(value, /<main\b/u);
});

test('the retired PRO route has a shell-preserving not-found boundary with one heading', () => {
  const path = new URL('../app/(tenant)/t/[tenant]/(pro)/not-found.tsx', import.meta.url);
  assert.equal(existsSync(path), true);
  const value = readFileSync(path, 'utf8');
  assert.equal(value.match(/<h1\b/gu)?.length, 1);
});

test('PRO settings routes compose exactly one h1 from their layout and page', () => {
  const layout = source('../app/(tenant)/t/[tenant]/(pro)/settings/layout.tsx');
  for (const pagePath of [
    '../app/(tenant)/t/[tenant]/(pro)/settings/page.tsx',
    '../app/(tenant)/t/[tenant]/(pro)/settings/billing/page.tsx',
  ]) {
    const page = source(pagePath);
    assert.equal((layout.match(/<h1\b/gu) ?? []).length + (page.match(/<h1\b/gu) ?? []).length, 1);
  }
});

test('the shared account role acceptance route uses a supported non-admin fixture role', () => {
  const value = source('../../tests/p2-acceptance/authenticated-desktop.spec.ts');
  assert.match(value, /role === 'Shared'[\s\S]{0,100}path === '\/account\/role'/u);
  assert.match(value, /path === '\/account\/role'[\s\S]{0,40}\? 'pro'/u);
  assert.doesNotMatch(value, /role === 'Shared'\s*\?\s*'admin'/u);
});

test('Signal Studio grid tracks and KPI decorations stay within their cards without clipping content', () => {
  const value = source('../app/globals.css');
  assert.match(
    value,
    /\.signal-dashboard__operations,\s*\.signal-dashboard__rail \{[^}]*grid-template-columns: minmax\(0, 1fr\);/u,
  );
  const sharedKpi = value.slice(
    value.indexOf('  .signal-kpi {'),
    value.indexOf('  .signal-kpi--info'),
  );
  assert.match(sharedKpi, /position: relative;/u);
  assert.doesNotMatch(sharedKpi, /overflow:\s*(?:hidden|clip)/u);
  assert.match(
    sharedKpi,
    /\.signal-kpi::after \{[^}]*inset-inline-end: 1\.25rem;[^}]*inset-block-end: 1\.25rem;[^}]*width: 5rem;[^}]*height: 5rem;/u,
  );
  assert.doesNotMatch(value, /^\s*\.signal-kpi::before/mu);
  assert.doesNotMatch(value, /^\s*\.signal-kpi:is\(:hover, :focus-visible\)::before/mu);
  assert.match(value, /\.signal-dashboard__kpis \.signal-kpi \{[^}]*overflow: hidden;/u);
  assert.match(
    value,
    /\.signal-dashboard__kpis \.signal-kpi::before \{[^}]*pointer-events: none;/u,
  );
});

test('application and renewal KPI definition lists contain only definition terms and details', () => {
  for (const path of [
    '../app/(tenant)/t/[tenant]/(pro)/applications/page.tsx',
    '../app/(tenant)/t/[tenant]/(pro)/renewals/page.tsx',
  ]) {
    const value = source(path);
    const start = value.indexOf('<dl className="signal-kpis-grid');
    const definitions = value.slice(start, value.indexOf('</dl>', start));
    assert.match(definitions, /<dd className="signal-kpi__helper">\{summary\.hint\}<\/dd>/u);
    assert.doesNotMatch(definitions, /<p className="signal-kpi__helper"/u);
  }
});

test('company activation links use warning-surface contrast instead of the primary control token', () => {
  const value = source('./pro/AssignedCompanyOverview.tsx');
  const start = value.indexOf('{snapshot.requirements.length > 0');
  const readiness = value.slice(start, value.indexOf('</section>', start));
  assert.match(readiness, /className="text-signal-warning-foreground [^"]*underline/u);
  assert.doesNotMatch(readiness, /className="text-primary [^"]*underline/u);
});

test('shared authenticated pages opt into accessible control and header CTA contrast', () => {
  const layout = source('../app/account/layout.tsx');
  const authLayout = source('../app/(auth)/layout.tsx');
  const header = source('./site/SiteHeader.tsx');
  const css = source('../app/globals.css');

  assert.match(layout, /className="authenticated-shared-surface/u);
  assert.match(layout, /<SiteHeader contrastMode="authenticated"/u);
  assert.match(authLayout, /<SiteHeader contrastMode="authenticated"/u);
  assert.match(header, /contrastMode\?: 'public' \| 'authenticated'/u);
  assert.match(header, /btn--authenticated-accent/u);
  assert.match(css, /\.authenticated-shared-surface \{[^}]*--primary: #c2410c;/u);
  assert.match(css, /\.site-public \.btn\.btn--authenticated-accent \{[^}]*background: #c2410c;/u);
});

test('MFA pages use theme-aware muted text instead of fixed zinc shades', () => {
  for (const path of [
    '../app/(auth)/mfa/enroll/page.tsx',
    './auth/MfaEnrollCard.tsx',
    './auth/MfaChallengeForm.tsx',
  ]) {
    const value = source(path);
    assert.doesNotMatch(value, /text-zinc-(?:500|600)/u);
    assert.match(value, /text-muted-foreground/u);
  }
});

test('the acceptance harness recognizes only the exact canonical route 53 document abort', () => {
  const value = source('../../tests/p2-acceptance/authenticated-desktop.spec.ts');
  assert.match(value, /route\.number === 53/u);
  assert.match(value, /new URL\(`\/t\/\$\{manifest\.tenantSlug\}\/company`, baseURL\)\.href/u);
  assert.match(value, /request\.resourceType\(\) === 'document'/u);
  assert.match(value, /error === 'net::ERR_ABORTED'/u);
  assert.match(value, /request\.isNavigationRequest\(\)/u);
  assert.match(value, /request\.frame\(\) === page\.mainFrame\(\)/u);
  assert.match(value, /url\.origin === canonicalUrl\.origin/u);
  assert.match(value, /url\.href === canonicalUrl\.href/u);
  assert.match(value, /expect\(page\.url\(\)\)\.toBe\(expectedCanonicalHref\)/u);
  assert.match(
    value,
    /expect\(new URL\(page\.url\(\)\)\.pathname\)\.toBe\(new URL\(expectedCanonicalHref\)\.pathname\)/u,
  );
  assert.doesNotMatch(value, /url\.pathname === new URL\(page\.url\(\)\)\.pathname/u);
  assert.match(value, /isExpectedNextPrefetchAbort/u);
  assert.match(value, /errorText: error/u);
  assert.match(value, /resourceType: request\.resourceType\(\)/u);
  assert.match(value, /isNavigationRequest: request\.isNavigationRequest\(\)/u);
  assert.match(value, /headers: request\.headers\(\)/u);
  assert.match(value, /expectedPrefetchAbort/u);
});
