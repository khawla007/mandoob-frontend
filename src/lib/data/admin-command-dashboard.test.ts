import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { DashboardPeriod } from '@/lib/admin-dashboard/contracts';
import { loadAdminCommandDashboard } from './admin-command-dashboard';

const period: DashboardPeriod = {
  days: 30,
  generatedAt: '2026-09-01T10:30:00.000Z',
  current: {
    start: '2026-08-02T20:00:00.000Z',
    end: '2026-09-01T20:00:00.000Z',
    startDate: '2026-08-03',
    endDate: '2026-09-01',
  },
  comparison: {
    start: '2026-07-03T20:00:00.000Z',
    end: '2026-08-02T20:00:00.000Z',
    startDate: '2026-07-04',
    endDate: '2026-08-02',
  },
};

function deps(overrides: Record<string, unknown> = {}) {
  return {
    authorize: async () => ({ id: 'operator' }),
    loadPortfolio: async () => ({
      totalLeads: 0,
      totalPros: 7,
      activePros: 6,
      totalCompanies: 8,
      activeAssignments: 5,
    }),
    loadPendingRenewals: async () => 2,
    loadPendingPayments: async () => 3,
    loadLeadFunnel: async () => ({ new: 4, won: 1 }),
    loadActivity: async () => [],
    loadProHealth: async () => [],
    logFailure: () => undefined,
    ...overrides,
  };
}

test('authorizes before starting any service-role source', async () => {
  let sourceStarted = false;
  await assert.rejects(
    loadAdminCommandDashboard(period, {
      ...deps(),
      authorize: async () => {
        assert.equal(sourceStarted, false);
        throw new Error('denied');
      },
      loadPortfolio: async () => {
        sourceStarted = true;
        throw new Error('must not run');
      },
    }),
    /denied/,
  );
  assert.equal(sourceStarted, false);
});

test('preserves real zero, unavailable slots, deterministic funnel, and metadata', async () => {
  const result = await loadAdminCommandDashboard(period, deps());
  assert.deepEqual(result.period, period);
  assert.deepEqual(result.kpis.totalLeads, { state: 'data', data: { value: 0 } });
  assert.deepEqual(result.kpis.unassignedPros, { state: 'data', data: { value: 1 } });
  assert.deepEqual(result.kpis.unassignedCompanies, { state: 'data', data: { value: 3 } });
  assert.deepEqual(result.kpis.activeRegistrations, { state: 'unavailable', reason: 'phase3' });
  assert.deepEqual(result.kpis.documentsAwaitingReview, {
    state: 'unavailable',
    reason: 'phase3',
  });
  assert.equal(result.leadFunnel.state, 'data');
  if (result.leadFunnel.state === 'data') {
    assert.deepEqual(
      result.leadFunnel.data.map((row) => row.stage),
      ['new', 'contacted', 'qualified', 'won', 'lost'],
    );
  }
  assert.equal(result.registrationOverview.state, 'unavailable');
  assert.equal(result.revenue.state, 'unavailable');
  assert.equal(result.registrationStages.state, 'unavailable');
});

test('isolates partial source failures and exposes only sanitized state', async () => {
  const result = await loadAdminCommandDashboard(
    period,
    deps({
      loadPendingPayments: async () => {
        throw new Error('database secret detail');
      },
      loadActivity: async () => [
        {
          id: '1',
          action: 'payment_succeeded',
          companyName: null,
          createdAt: '2026-08-31T12:00:00.000Z',
        },
      ],
    }),
  );
  assert.deepEqual(result.kpis.pendingPayments, { state: 'error', reason: 'sanitized' });
  assert.equal(result.kpis.totalLeads.state, 'data');
  assert.equal(result.activity.state, 'data');
  assert.doesNotMatch(JSON.stringify(result), /database secret detail/u);
});

test('isolates an inconsistent assignment snapshot instead of failing the page', async () => {
  const result = await loadAdminCommandDashboard(
    period,
    deps({
      loadPortfolio: async () => ({
        totalLeads: 4,
        totalPros: 1,
        activePros: 1,
        totalCompanies: 1,
        activeAssignments: 2,
      }),
    }),
  );
  assert.equal(result.kpis.totalLeads.state, 'error');
  assert.equal(result.kpis.activeAssignments.state, 'error');
  assert.equal(result.leadFunnel.state, 'data');
});

test('production source uses exact counts, bounded deterministic lists, and batched PRO joins', async () => {
  const source = await readFile(new URL('./admin-command-dashboard.ts', import.meta.url), 'utf8');
  assert.match(source, /count: 'exact', head: true/g);
  assert.match(source, /\.limit\(ACTIVITY_LIMIT\)/u);
  assert.match(source, /\.limit\(PRO_HEALTH_LIMIT\)/u);
  assert.match(
    source,
    /\.order\('created_at', \{ ascending: false \}\)[\s\S]*\.order\('id', \{ ascending: false \}\)/u,
  );
  assert.match(source, /\.in\('pro_profile_id', proIds\)/u);
  assert.doesNotMatch(source, /select\([^)]*details/u);
  assert.doesNotMatch(source, /auth_events/u);
});
