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
    assert.match(velocity, /data-testid="case-velocity-chart"/);
    assert.match(velocity, /aria-label=/);

    const finance = source('CollectionsWaterfall');
    assert.match(finance, /BarChart/);
    assert.match(finance, /valueMinor/);
    assert.match(finance, /if \(!canViewFinance\) return null/);
  });

  it('offers additive event details and responsive semantic deadline views', () => {
    const heatmap = source('DeadlineHeatmap');
    assert.match(heatmap, /eventTypes/);
    assert.match(heatmap, /aria-label/);
    assert.match(heatmap, /hidden[^"\n]*md:grid/);
    assert.match(heatmap, /md:hidden/);
    assert.match(heatmap, /<ol/);
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

  it('exposes a discriminated local status API on every widget', () => {
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
      assert.match(source(name), /WidgetStatus/);
    }
  });
});
