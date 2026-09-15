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
    assert.doesNotMatch(hero, /activeClients|TeamSignal|ownerName|health\.score|assignWork/u);
  });

  it('renders four non-duplicated decision instruments', () => {
    const summary = source('CompanySummaryDeck');
    for (const key of ['readiness', 'documents', 'renewals', 'finance'])
      assert.match(summary, new RegExp(`key: '${key}'`));
    assert.doesNotMatch(summary, /key: 'registration'|key: 'actions'/u);
    assert.match(summary, /xl:grid-cols-\[1\.15fr_0\.85fr_0\.85fr_1fr\]/u);
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
