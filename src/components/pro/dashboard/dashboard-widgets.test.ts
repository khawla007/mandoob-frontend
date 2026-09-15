import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = (name: string) => readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8');

describe('one-Company PRO dashboard widget contracts', () => {
  it('keeps accepted operational charts accessible and directly linked', () => {
    const velocity = source('CaseVelocityChart');
    assert.match(velocity, /AreaChart/);
    assert.match(velocity, /dataKey="opened"/);
    assert.match(velocity, /dataKey="completed"/);
    assert.match(velocity, /<details/);
    assert.match(velocity, /<caption className="sr-only">/);
    assert.match(velocity, /isAnimationActive=\{false\}/);
    const finance = source('CollectionsWaterfall');
    assert.match(finance, /if \(!canViewFinance\) return null/);
    assert.match(finance, /paymentSignalHref\(tenantSlug/);
    assert.match(finance, /aria-label=\{item\.accessibleLabel\}/);
  });

  it('uses a Company-only Design B hero', () => {
    const hero = source('CompanySignalHero');
    for (const key of ['companyName', 'readinessCodes', 'totalPrioritySignals', 'caseVelocity'])
      assert.match(hero, new RegExp(key));
    assert.match(hero, /signal-hero__chart/u);
    assert.match(hero, /!readinessAvailable[\s\S]*readinessCodes\.length === 0/u);
    assert.match(hero, /\{openedPoints \? \([\s\S]*<polygon[\s\S]*<polyline[\s\S]*<polyline/u);
    assert.doesNotMatch(hero, /activeClients|TeamSignal|ownerName|health\.score|assignWork/u);
  });

  it('renders four non-duplicated decision instruments', () => {
    const summary = source('CompanySummaryDeck');
    const definitionKeys = [...summary.matchAll(/key:\s*'([^']+)'/g)].map(([, key]) => key);
    assert.deepEqual(definitionKeys, ['readiness', 'documents', 'renewals', 'finance']);
    assert.match(summary, /xl:grid-cols-\[1\.15fr_0\.85fr_0\.85fr_1fr\]/u);
  });

  it('keeps summary helpers wrapping at full width without clipping utilities', () => {
    const summary = source('CompanySummaryDeck');
    const helper = summary.match(/<span className="signal-kpi__helper[^"]*"/u)?.[0] ?? '';

    assert.match(helper, /\bw-full\b/u);
    assert.match(helper, /\bwhitespace-normal\b/u);
    assert.match(helper, /\bbreak-words\b/u);
    assert.doesNotMatch(helper, /\btruncate\b/u);
    assert.doesNotMatch(helper, /max-w-\[80%\]/u);
  });

  it('derives bounded decorative trends from each decision source', () => {
    const summary = source('CompanySummaryDeck');
    assert.match(
      summary,
      /Object\.values\(company\.sectionProgress\)[\s\S]*status === 'complete' \? 1 : 0/u,
    );
    assert.match(summary, /dashboard\.pendingDocuments\.slice\(0, 5\)\.map\(\(\) => 1\)/u);
    assert.match(
      summary,
      /trend:\s*renewalsUnavailable[\s\S]*?\[dashboard\.kpis\.renewalsDue7d, dashboard\.kpis\.renewalsDue30d\]/u,
    );
    assert.match(
      summary,
      /trend:\s*financeUnavailable[\s\S]*?\[dashboard\.finance\.dueSoonMinor, dashboard\.finance\.overdueMinor\]/u,
    );
    assert.match(summary, /item\.trend\.filter\(\(value\) => value > 0\)/u);
    assert.match(summary, /const trendMaximum = Math\.max\(1, \.\.\.trend\)/u);
    assert.match(summary, /aria-hidden="true" className="signal-kpi__bars"/u);
    assert.match(summary, /height: `\$\{\(value \/ trendMaximum\) \* 100\}%`/u);
    assert.match(summary, /minHeight: 0/u);
    assert.doesNotMatch(summary, /Math\.max\(16/u);
  });

  it('suppresses numeric values and trends for independently unavailable sources', () => {
    const summary = source('CompanySummaryDeck');
    for (const key of ['readiness', 'documents', 'renewals', 'finance']) {
      assert.match(summary, new RegExp(`const ${key}Unavailable =`));
      assert.match(
        summary,
        new RegExp(`value:\\s*${key}Unavailable\\s*\\?\\s*labels\\.unavailable`),
      );
      assert.match(summary, new RegExp(`trend:\\s*${key}Unavailable\\s*\\?\\s*\\[\\]`));
      assert.match(summary, new RegExp(`states\\?\\.${key}\\?\\.message`));
    }
  });

  it('keeps pending-document states distinct and bounded', () => {
    const pending = source('PendingDocuments');
    assert.match(pending, /labels\.states\[document\.state\]/);
    assert.match(pending, /\.slice\(0, 5\)/);
    assert.match(pending, /document\.href/);
  });

  it('uses sanitized typed unavailable regions for unsupported sources', () => {
    const unavailable = source('DashboardUnavailablePanel');
    assert.match(unavailable, /role="status"/);
    assert.match(unavailable, /unavailable/);
    assert.doesNotMatch(unavailable, /error\.message|cause|stack/);
  });

  it('keeps action ranking bounded without owner or team presentation', () => {
    const actions = source('ActionDeck');
    assert.match(actions, /\.slice\(0, 5\)/);
    assert.match(actions, /withApplicationScope\(action\.href, filters\)/);
    assert.doesNotMatch(actions, /ownerName|unassigned|TeamSignal/);
  });

  it('preserves independent discriminated widget states', () => {
    for (const name of [
      'CaseVelocityChart',
      'CollectionsWaterfall',
      'DeadlineHeatmap',
      'ActionDeck',
      'RenewalStreams',
    ])
      assert.match(source(name), /WidgetStateProps/);
  });
});
