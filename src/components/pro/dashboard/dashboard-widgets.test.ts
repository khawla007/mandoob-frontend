import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = (name: string) => readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8');

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

  it('uses Recharts for velocity and a direct four-column collections waterfall', () => {
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
    assert.match(velocity, /<AreaChart[^>]*accessibilityLayer=\{false\}/);
    assert.doesNotMatch(velocity, /role="img"/);
    assert.match(velocity, /isAnimationActive=\{false\}/);
    assert.match(velocity, /useId\(\)/);
    assert.match(velocity, /applicationSignalHref\(tenantSlug, \{ view: 'open' \}, filters\)/);

    const finance = source('CollectionsWaterfall');
    assert.match(finance, /valueMinor/);
    assert.match(finance, /if \(!canViewFinance\) return null/);
    assert.doesNotMatch(finance, /BarChart|ChartContainer|CartesianGrid|ChartTooltip/);
    assert.match(finance, /signal-waterfall__columns/);
    assert.match(
      finance,
      /height: `\$\{Math\.max\(14, \(item\.valueMinor \/ maximum\) \* 82\)\}%`/,
    );
    assert.match(finance, /fill: 'var\(--signal-success\)'/);
    assert.match(finance, /fill: 'var\(--signal-coral\)'/);
    assert.match(finance, /<a[\s\S]*href=\{item\.href\}/);
    assert.match(finance, /aria-label=\{item\.accessibleLabel\}/);
    assert.match(
      finance,
      /const paymentsHref = `\/t\/\$\{encodeURIComponent\(tenantSlug\)\}\/payments`/,
    );
    assert.match(finance, /paymentSignalHref\(tenantSlug/);
    assert.match(finance, /aria-hidden="true"/);
    assert.match(finance, /<ul[\s\S]*<li[\s\S]*<a/);
    assert.doesNotMatch(finance, /role="listitem"/);
  });

  it('uses real velocity data for the hero graph and a derived dark capacity envelope', () => {
    const hero = source('SignalHero');
    assert.match(hero, /signal-hero__chart/);
    assert.match(hero, /caseVelocity\.slice\(-14\)/);
    assert.match(hero, /<svg/);

    const velocity = source('CaseVelocityChart');
    assert.match(velocity, /capacity:\s*Math\.max\(point\.opened, point\.completed\)/);
    assert.match(velocity, /dataKey="capacity"/);
    assert.match(velocity, /var\(--signal-capacity\)/);
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
    assert.match(actions, /text-foreground\/70 block truncate text-xs/);
    assert.match(actions, /signal-action-card__meta text-foreground\/70 flex flex-wrap/);

    const team = source('TeamSignal');
    assert.match(team, /activeCases/);
    assert.match(team, /capacityPercent/);
    assert.match(team, /unassignedCases/);
    assert.doesNotMatch(team, /completion/i);
    assert.match(team, /aria-valuemax=\{100\}/);
    assert.match(team, /aria-valuetext=/);
    assert.match(team, /applicationSignalHref\(tenantSlug, \{ view: 'open' \}, filters\)/);
  });

  it('keeps inactive velocity range controls above minimum contrast', () => {
    const velocity = source('CaseVelocityChart');
    assert.match(velocity, /'text-foreground\/70 hover:text-foreground'/);
    assert.doesNotMatch(velocity, /'text-muted-foreground hover:text-foreground'/);
    assert.match(velocity, /aria-label=\{`\$\{labels\.title\}: \$\{labels\.rangeLabel\}`\}/);
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
    assert.doesNotMatch(kpis, /LucideIcon|item\.icon|const Icon/);
    assert.match(kpis, /min-h-\[77px\]/);
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

  it('matches Design B card density and confines texture to meaningful graphics', () => {
    assert.doesNotMatch(
      styles,
      /\.signal-action-deck \[data-slot='card-content'\] > a\s*\{[^}]*repeating-linear-gradient/,
    );
    assert.doesNotMatch(styles, /\.signal-streams\s*\{[^}]*repeating-linear-gradient/);
    assert.doesNotMatch(
      styles,
      /\.signal-widget-state,[\s\S]*?\.signal-dashboard__state\s*\{[^}]*repeating-linear-gradient/,
    );
    assert.match(styles, /\.signal-panel::before\s*\{[^}]*display:\s*none/);
    assert.match(styles, /\.signal-panel \[data-slot='card-header'\]\s*\{[^}]*display:\s*flex/);
    assert.match(
      styles,
      /\.signal-panel \[data-slot='card-description'\]\s*\{[^}]*white-space:\s*nowrap/,
    );
    assert.match(styles, /\.signal-waterfall__columns\s*\{[^}]*grid-template-columns:\s*repeat\(4/);
    assert.match(styles, /font-size:\s*0\.75rem\s*!important/);
  });

  it('lets compact panel headers and filters wrap inside the mobile viewport', () => {
    assert.match(
      styles,
      /@media \(max-width: 47\.99rem\)[\s\S]*\.signal-panel \[data-slot='card-header'\]\s*\{[^}]*flex-wrap:\s*wrap/,
    );
    assert.match(
      styles,
      /@media \(max-width: 47\.99rem\)[\s\S]*\.signal-panel \[data-slot='card-description'\]\s*\{[^}]*white-space:\s*normal/,
    );
    assert.match(
      styles,
      /@media \(max-width: 47\.99rem\)[\s\S]*\.signal-dashboard__filter-drawer\s*\{[^}]*position:\s*static/,
    );
  });

  it('uses the exact live-port Design B card and waterfall measurements', () => {
    assert.match(styles, /--signal-canvas:\s*#f5f2ee/);
    assert.match(styles, /--signal-coral:\s*#ff8a65/);
    assert.match(
      styles,
      /\.signal-hero\s*\{[^}]*height:\s*calc\(147px \* var\(--signal-scale\)\)\s*!important/,
    );
    assert.match(styles, /\.signal-kpis-grid\s*\{[^}]*gap:\s*calc\(7px \* var\(--signal-scale\)\)/);
    assert.match(
      styles,
      /\.signal-dashboard__layout\s*\{[^}]*gap:\s*calc\(7px \* var\(--signal-scale\)\)/,
    );
    assert.match(
      styles,
      /\.signal-panel\s*\{[^}]*border-radius:\s*calc\(10px \* var\(--signal-scale\)\)[^}]*padding:\s*calc\(9px \* var\(--signal-scale\)\)\s*!important/,
    );
    assert.match(
      styles,
      /\.signal-waterfall__columns\s*\{[^}]*height:\s*calc\(90px \* var\(--signal-scale\)\)/,
    );

    const finance = source('CollectionsWaterfall');
    for (const color of [
      '#67b995',
      '#277a57',
      '#ff9a75',
      '#ff5722',
      '#f4cc75',
      '#b97913',
      '#ef8e86',
      '#ca4d43',
    ]) {
      assert.match(finance, new RegExp(color));
    }
    assert.match(finance, /\$\{item\.top\}/);
    assert.match(finance, /\$\{item\.bottom\}/);
  });

  it('uses the live-port hero composition instead of a generic two-column card', () => {
    const hero = source('SignalHero');
    assert.match(hero, /signal-hero__tag/);
    assert.match(hero, /signal-hero__content[\s\S]*<h3/);
    assert.match(hero, /signal-hero__actions/);
    assert.doesNotMatch(hero, /text-5xl|min-h-36|lg:grid-cols/);
    assert.match(
      styles,
      /\.signal-hero__content\s*\{[^}]*width:\s*47%[^}]*justify-content:\s*center/,
    );
    assert.match(
      styles,
      /\.signal-hero__chart\s*\{[^}]*width:\s*50%[^}]*height:\s*calc\(105px \* var\(--signal-scale\)\)/,
    );
  });

  it('uses the live-port KPI, velocity, and action-card density', () => {
    const kpis = source('SignalKpis');
    assert.doesNotMatch(kpis, /text-xl|mb-3|mt-1/);
    assert.match(
      styles,
      /\.signal-velocity \[data-testid='case-velocity'\]\s*\{[^}]*height:\s*calc\(105px \* var\(--signal-scale\)\)/,
    );
    assert.match(styles, /\.signal-kpi__content > span:first-child\s*\{[^}]*margin:\s*0/);
    assert.match(
      styles,
      /\.signal-kpi\s*\{[^}]*height:\s*calc\(102px \* var\(--signal-scale\)\)\s*!important[^}]*min-height:\s*calc\(102px \* var\(--signal-scale\)\)\s*!important/,
    );
    assert.match(
      styles,
      /\.signal-kpi__content > strong\s*\{[^}]*margin:\s*calc\(8px \* var\(--signal-scale\)\) 0[^}]*calc\(8px \* var\(--signal-scale\)\)[^}]*font-size:\s*calc\(14px \* var\(--signal-scale\)\)/,
    );
    assert.match(
      styles,
      /\.signal-action-deck \[data-slot='card-content'\] > a\s*\{[^}]*height:\s*calc\(137px \* var\(--signal-scale\) - 45px\)\s*!important[^}]*justify-content:\s*center\s*!important[^}]*gap:\s*10px[^}]*line-height:\s*1\.45/,
    );
    assert.match(
      styles,
      /\.signal-action-deck \[data-slot='card-content'\] > a\s*\{[^}]*display:\s*flex\s*!important/,
    );
    assert.doesNotMatch(source('ActionDeck'), /signal-action-card block/);
    assert.match(source('ActionDeck'), /signal-action-card__urgency/);
    assert.doesNotMatch(source('ActionDeck'), /px-2 py-0\.5/);
    assert.doesNotMatch(source('ActionDeck'), /signal-action-card__meta mt-3/);
    assert.match(
      styles,
      /\.signal-action-card__body\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*gap:\s*10px/,
    );
    assert.match(
      styles,
      /\.signal-action-card__heading\s*\{[^}]*column-gap:\s*8px[^}]*row-gap:\s*10px[^}]*margin:\s*0/,
    );
    assert.match(
      styles,
      /\.signal-action-card__urgency\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*padding:\s*5px 8px[^}]*line-height:\s*1/,
    );
    assert.match(styles, /\.signal-action-card__meta\s*\{[^}]*margin-top:\s*0\s*!important/);
    assert.match(
      styles,
      /\.signal-action-deck \[data-slot='card-content'\] > a::after\s*\{[^}]*width:\s*calc\(42px \* var\(--signal-scale\)\)[^}]*height:\s*calc\(42px \* var\(--signal-scale\)\)[^}]*repeating-linear-gradient/,
    );
  });

  it('matches the live Design B KPI and Action Deck color sequence', () => {
    const kpis = source('SignalKpis');
    assert.match(kpis, /key: 'activeClients'[\s\S]{0,500}tone: 'signal-kpi--orange'/);
    assert.match(kpis, /key: 'openCases'[\s\S]{0,500}tone: 'signal-kpi--info'/);
    assert.match(kpis, /signal-kpi__content/);
    assert.match(styles, /\.signal-kpi__content\s*\{[^}]*justify-content:\s*center/);
    assert.match(
      styles,
      /\.signal-kpi::after\s*\{[^}]*width:\s*calc\(65px \* var\(--signal-scale\)\)[^}]*height:\s*calc\(65px \* var\(--signal-scale\)\)/,
    );

    const actions = source('ActionDeck');
    assert.match(actions, /ACTION_CARD_TONES/);
    assert.match(
      actions,
      /\[\s*'signal-action-card--coral',\s*'signal-action-card--sand',\s*'signal-action-card--blue',?\s*\]/,
    );
    assert.match(actions, /ACTION_CARD_TONES\[index % ACTION_CARD_TONES\.length\]/);
    assert.match(styles, /\.signal-action-card--coral\s*\{[^}]*#fff0e8[^}]*#fffdfa/);
    assert.match(styles, /\.signal-action-card--sand\s*\{[^}]*#f8eed7[^}]*#fffdfa/);
    assert.match(styles, /\.signal-action-card--blue\s*\{[^}]*#e7f1f4[^}]*#fffdfa/);
  });

  it('uses one reversible broad-glass pass instead of lifting Action Deck cards', () => {
    const actions = source('ActionDeck');
    assert.doesNotMatch(actions, /signal-action-card[^'\n]*hover:-translate-y-0\.5/);
    assert.match(
      styles,
      /\.signal-action-card::before\s*\{[^}]*linear-gradient\([^}]*rgb\(255 255 255 \/ 88%\)[^}]*transition:\s*transform 700ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
    );
    assert.match(
      styles,
      /\.signal-action-card:is\(:hover, :focus-visible\)::before\s*\{[^}]*transform:\s*translateX\(700%\) skewX\(-18deg\)/,
    );
    assert.match(
      styles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.signal-action-card::before\s*\{[^}]*transition:\s*none\s*!important/,
    );
  });

  it('reuses the reversible broad-glass pass on all four KPI cards', () => {
    const kpis = source('SignalKpis');
    assert.doesNotMatch(kpis, /signal-kpi[^'\n]*hover:-translate-y-0\.5/);
    assert.doesNotMatch(kpis, /signal-kpi[^'\n]*hover:shadow-lg/);
    assert.match(
      styles,
      /\.signal-kpi::before\s*\{[^}]*linear-gradient\([^}]*rgb\(255 255 255 \/ 88%\)[^}]*transition:\s*transform 700ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
    );
    assert.match(
      styles,
      /\.signal-kpi:is\(:hover, :focus-visible\)::before\s*\{[^}]*transform:\s*translateX\(700%\) skewX\(-18deg\)/,
    );
    assert.match(
      styles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.signal-kpi::before\s*\{[^}]*transition:\s*none\s*!important/,
    );
  });
});
