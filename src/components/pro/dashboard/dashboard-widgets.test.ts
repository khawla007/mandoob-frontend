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

  it('renders one assigned Company command and six distinct summary instruments', () => {
    const command = source('CompanyCommand');
    for (const key of ['companyName', 'readinessCodes', 'sectionProgress', 'profileSections'])
      assert.match(command, new RegExp(key));
    const summary = source('CompanySummaryDeck');
    for (const key of ['readiness', 'registration', 'documents', 'actions', 'renewals', 'finance'])
      assert.match(summary, new RegExp(`key: '${key}'`));
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
