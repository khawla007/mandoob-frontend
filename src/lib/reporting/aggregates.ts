import type { ReportSourceState } from './catalog';

export type OperationalFact = {
  id: string;
  companyId: string | null;
  kind: 'employee' | 'renewal' | 'meeting';
  state: string;
};

export function aggregateOperationalFacts(
  facts: readonly OperationalFact[],
  companyId: string,
  sources: readonly ReportSourceState[],
) {
  const owned = facts.filter((fact) => fact.companyId === companyId);
  const unavailableSources = sources
    .filter((source) => source.state !== 'fresh')
    .map((source) => source.source);
  return {
    activeEmployees: owned.filter((fact) => fact.kind === 'employee' && fact.state === 'active')
      .length,
    overdueRenewals: owned.filter((fact) => fact.kind === 'renewal' && fact.state === 'overdue')
      .length,
    scheduledMeetings: owned.filter((fact) => fact.kind === 'meeting' && fact.state === 'scheduled')
      .length,
    state: unavailableSources.length > 0 ? ('partial' as const) : ('ready' as const),
    unavailableSources,
    sourceFreshness: Object.fromEntries(
      sources
        .filter((source) => source.state === 'fresh' && source.freshAt)
        .map((source) => [source.source, source.freshAt as string]),
    ),
  };
}

export type FinanceFact = {
  id: string;
  status: string;
  currency: string;
  paidMinor: number;
  refundedMinor: number;
};

export function aggregateFinanceFacts(facts: readonly FinanceFact[]) {
  const included = facts.filter(
    (fact) => fact.currency === 'AED' && !['draft', 'void', 'cancelled'].includes(fact.status),
  );
  return {
    currency: 'AED' as const,
    collectedMinor: included.reduce((sum, fact) => sum + fact.paidMinor - fact.refundedMinor, 0),
    includedInvoices: included.length,
    excludedInvoices: facts.length - included.length,
  };
}
