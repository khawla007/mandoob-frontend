import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = (name: string) => readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8');

describe('Signal Studio widget contracts', () => {
  it('keeps the operations score explainable with a keyboard-safe Dialog', () => {
    const hero = source('SignalHero');
    assert.match(hero, /DialogTrigger asChild/);
    assert.match(hero, /overdueRatio/);
    assert.match(hero, /slaCompletionRate/);
    assert.match(hero, /blockedRatio/);
    assert.match(hero, /reminderRate/);
    assert.match(hero, /workloadBalance/);
    assert.match(hero, /aria-label/);
  });

  it('uses Recharts with two velocity series and raw finance values', () => {
    const velocity = source('CaseVelocityChart');
    assert.match(velocity, /AreaChart/);
    assert.match(velocity, /dataKey="opened"/);
    assert.match(velocity, /dataKey="completed"/);
    assert.match(velocity, /data-testid="case-velocity"/);
    assert.match(velocity, /dashboard\?range=/);
    assert.doesNotMatch(velocity, /dashboard\?days=/);
    assert.match(velocity, /aria-label=/);

    const finance = source('CollectionsWaterfall');
    assert.match(finance, /BarChart/);
    assert.match(finance, /valueMinor/);
    assert.match(finance, /if \(!canViewFinance\) return null/);
    assert.match(finance, /<Bar[\s\S]*<Cell/);
    assert.doesNotMatch(finance, /<(?:svg|rect|path)\b/);
    assert.match(finance, /<a[\s\S]*href=\{item\.href\}/);
    assert.match(finance, /aria-label=\{item\.accessibleLabel\}/);
    assert.match(
      finance,
      /const paymentsHref = `\/t\/\$\{encodeURIComponent\(tenantSlug\)\}\/payments`/,
    );
    assert.match(finance, /dashboardHref\(tenantSlug, 'payments', \{ view: item\.key \}\)/);
  });

  it('offers additive event details and responsive semantic deadline views', () => {
    const heatmap = source('DeadlineHeatmap');
    assert.match(heatmap, /eventTypes/);
    assert.match(heatmap, /aria-label/);
    assert.match(heatmap, /hidden[^"\n]*md:grid/);
    assert.match(heatmap, /md:hidden/);
    assert.match(heatmap, /<ol/);
    assert.match(heatmap, /role="gridcell"[\s\S]*?<Link/);
    assert.doesNotMatch(heatmap, /<Link[\s\S]{0,500}role="gridcell"/);
  });

  it('limits actions, preserves direct hrefs, and never ranks team completion', () => {
    const actions = source('ActionDeck');
    assert.match(actions, /\.slice\(0, 5\)/);
    assert.match(actions, /href=\{action\.href\}/);
    assert.match(actions, /action\.ownerName/);
    assert.match(actions, /action\.deadline/);

    const team = source('TeamSignal');
    assert.match(team, /activeCases/);
    assert.match(team, /capacityPercent/);
    assert.match(team, /unassignedCases/);
    assert.doesNotMatch(team, /completion/i);
  });

  it('uses four arrow-ended renewal streams and four linked KPI cards', () => {
    const renewals = source('RenewalStreams');
    assert.match(renewals, /clipPath/);
    assert.match(renewals, /rtl:scale-x-\[-1\]/);
    assert.match(renewals, /d7/);
    assert.match(renewals, /d30/);
    assert.match(renewals, /d60/);
    assert.match(renewals, /d90/);

    const kpis = source('SignalKpis');
    assert.match(kpis, /dashboardHref/);
    assert.match(kpis, /font-mono/);
    assert.match(kpis, /tabular-nums/);
    assert.match(kpis, /focus-visible:ring-2/);
  });

  it('exposes a discriminated local state API on every widget', () => {
    for (const name of [
      'SignalHero',
      'SignalKpis',
      'CaseVelocityChart',
      'CollectionsWaterfall',
      'DeadlineHeatmap',
      'ActionDeck',
      'RenewalStreams',
      'TeamSignal',
    ]) {
      assert.match(source(name), /WidgetStateProps/);
      assert.doesNotMatch(source(name), /status\?: WidgetStatus/);
    }
  });

  it('uses family-shaped skeletons instead of a generic row skeleton', () => {
    const widgets = [
      ['SignalHero', 'signal-hero-skeleton'],
      ['SignalKpis', 'signal-kpis-skeleton'],
      ['CaseVelocityChart', 'signal-chart-skeleton'],
      ['CollectionsWaterfall', 'signal-chart-skeleton'],
      ['DeadlineHeatmap', 'signal-heatmap-skeleton'],
      ['ActionDeck', 'signal-action-skeleton'],
      ['RenewalStreams', 'signal-streams-skeleton'],
      ['TeamSignal', 'signal-team-skeleton'],
    ] as const;
    for (const [name, testId] of widgets) {
      assert.match(source(name), new RegExp(`testId="${testId}"`));
    }
  });

  it('gives empty states a typed useful action', () => {
    const state = readFileSync(new URL('./widget-state.tsx', import.meta.url), 'utf8');
    assert.match(state, /export type EmptyAction/);
    assert.match(state, /kind: 'empty'; message: string; emptyAction: EmptyAction/);
    assert.match(state, /status\.emptyAction\.href/);
    assert.match(state, /status\.emptyAction\.label/);
  });
});
