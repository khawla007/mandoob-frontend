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
    assert.match(velocity, /role="region"/);
    assert.match(velocity, /<details/);
    assert.match(velocity, /<summary/);
    assert.match(velocity, /<caption className="sr-only">/);
    assert.match(velocity, /aria-hidden="true"/);
    assert.doesNotMatch(velocity, /role="img"/);
    assert.match(velocity, /isAnimationActive=\{false\}/);
    assert.match(velocity, /useId\(\)/);
    assert.match(velocity, /applicationSignalHref\(tenantSlug, \{ view: 'open' \}, filters\)/);

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
    assert.match(finance, /paymentSignalHref\(tenantSlug/);
    assert.match(finance, /isAnimationActive=\{false\}/);
    assert.match(finance, /aria-hidden="true"/);
    assert.match(finance, /signal-collection-bar/);
    assert.match(finance, /<ul[\s\S]*<li[\s\S]*<a/);
    assert.doesNotMatch(finance, /role="listitem"/);
  });

  it('offers additive event details and responsive semantic deadline views', () => {
    const heatmap = source('DeadlineHeatmap');
    assert.match(heatmap, /eventTypes/);
    assert.match(heatmap, /aria-label/);
    assert.match(heatmap, /hidden[^"\n]*md:block/);
    assert.match(heatmap, /md:hidden/);
    assert.match(heatmap, /<ol/);
    assert.match(heatmap, /tabIndex=\{rovingIndex === cellIndex \? 0 : -1\}/);
    assert.match(heatmap, /nextDeadlineCellIndex/);
    assert.match(heatmap, /DialogContent/);
    assert.match(heatmap, /onCloseAutoFocus/);
    assert.match(heatmap, /cellRefs\.current\[activeIndex\]\?\.focus\(\)/);
    assert.match(heatmap, /closeLabel=\{labels\.close\}/);
    assert.match(heatmap, /onKeyDown/);
    assert.doesNotMatch(heatmap, /<button[\s\S]{0,300}title=/);
    assert.doesNotMatch(heatmap, /slice\(0, 14\)/);
    assert.doesNotMatch(heatmap, /<Link[\s\S]{0,500}role="gridcell"/);
    for (const type of ['case', 'renewal', 'document', 'invoice']) {
      assert.match(heatmap, new RegExp(`${type}Event`));
    }
  });

  it('limits actions, preserves direct hrefs, and never ranks team completion', () => {
    const actions = source('ActionDeck');
    assert.match(actions, /\.slice\(0, 5\)/);
    assert.match(actions, /withApplicationScope\(action\.href, filters\)/);
    assert.match(actions, /action\.ownerName/);
    assert.match(actions, /action\.deadline/);
    assert.match(actions, /generatedAt/);
    assert.match(actions, /formatActionCountdown/);
    assert.match(actions, /owner:\s*action\.ownerName/);
    assert.match(actions, /countdown/);
    assert.match(actions, /absoluteDeadline/);
    assert.match(actions, /:\s*'';/);

    const team = source('TeamSignal');
    assert.match(team, /activeCases/);
    assert.match(team, /capacityPercent/);
    assert.match(team, /unassignedCases/);
    assert.doesNotMatch(team, /completion/i);
    assert.match(team, /aria-valuemax=\{100\}/);
    assert.match(team, /aria-valuetext=/);
    assert.match(team, /applicationSignalHref\(tenantSlug, \{ view: 'open' \}, filters\)/);
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
    assert.match(kpis, /applicationSignalHref/);
    assert.match(kpis, /paymentSignalHref/);
    assert.match(kpis, /font-mono/);
    assert.match(kpis, /tabular-nums/);
    assert.match(kpis, /focus-visible:ring-2/);
    assert.match(kpis, /states\?\./);
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

  it('requires deterministic locale and typed labels for every widget state', () => {
    const state = readFileSync(new URL('./widget-state.tsx', import.meta.url), 'utf8');
    assert.match(state, /locale: string/);
    assert.match(state, /labels: Labels/);
    assert.match(state, /role="status"/);
    assert.match(state, /className="sr-only"/);
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
      assert.match(source(name), /export type \w+Labels/);
      assert.doesNotMatch(source(name), /locale\?: string/);
      assert.doesNotMatch(source(name), /toLocale(?:String|DateString)\(undefined/);
    }
  });

  it('locale-formats visible hero, renewal, and team metrics while preserving meter values', () => {
    for (const name of ['SignalHero', 'RenewalStreams', 'TeamSignal']) {
      assert.match(source(name), /new Intl\.NumberFormat\(locale/);
    }
    const team = source('TeamSignal');
    assert.match(team, /aria-valuenow=\{Math\.min\(100, member\.capacityPercent\)\}/);
    assert.match(team, /percent\.format\(member\.capacityPercent \/ 100\)/);
    assert.doesNotMatch(team, />\{member\.capacityPercent\}%</);
  });
});
