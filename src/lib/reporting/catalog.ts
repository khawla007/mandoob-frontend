export type ReportAudience = 'admin' | 'pro' | 'customer';
export type ReportSourceKey = 'local' | 'p305' | 'p306' | 'p309' | 'p310';
export type ReportSourceRequirement = 'required' | 'optional' | 'unintegrated';
export type ReportAvailability = 'ready' | 'partial' | 'unavailable';

export type ReportDefinition = {
  id: string;
  version: number;
  owner: 'P3.12';
  roles: readonly ReportAudience[];
  scope: 'platform' | 'company';
  periodSemantics: 'point_in_time' | 'half_open_period';
  businessTimezone: 'Asia/Dubai';
  currency: 'AED';
  pagination: { kind: 'cursor'; maxPageSize: number; tieBreaker: 'id' };
  exportPolicy: 'bounded_sync' | 'unavailable';
  retentionClass: string;
  sources: Partial<Record<ReportSourceKey, ReportSourceRequirement>>;
};

export type ReportSourceState = {
  source: string;
  state: 'fresh' | 'stale' | 'unavailable';
  freshAt?: string;
  reason?: string;
};

export const REPORT_CATALOG: {
  version: 1;
  reports: Record<string, ReportDefinition>;
} = {
  version: 1,
  reports: {
    'platform-operations': {
      id: 'platform-operations',
      version: 1,
      owner: 'P3.12',
      roles: ['admin'],
      scope: 'platform',
      periodSemantics: 'point_in_time',
      businessTimezone: 'Asia/Dubai',
      currency: 'AED',
      pagination: { kind: 'cursor', maxPageSize: 100, tieBreaker: 'id' },
      exportPolicy: 'bounded_sync',
      retentionClass: 'operational-report-export',
      sources: {
        local: 'required',
        p305: 'unintegrated',
        p306: 'unintegrated',
        p309: 'unintegrated',
      },
    },
    'company-operations': {
      id: 'company-operations',
      version: 1,
      owner: 'P3.12',
      roles: ['admin', 'pro', 'customer'],
      scope: 'company',
      periodSemantics: 'point_in_time',
      businessTimezone: 'Asia/Dubai',
      currency: 'AED',
      pagination: { kind: 'cursor', maxPageSize: 100, tieBreaker: 'id' },
      exportPolicy: 'bounded_sync',
      retentionClass: 'operational-report-export',
      sources: { local: 'required', p306: 'unintegrated', p309: 'unintegrated' },
    },
    'platform-finance': {
      id: 'platform-finance',
      version: 1,
      owner: 'P3.12',
      roles: ['admin'],
      scope: 'platform',
      periodSemantics: 'half_open_period',
      businessTimezone: 'Asia/Dubai',
      currency: 'AED',
      pagination: { kind: 'cursor', maxPageSize: 100, tieBreaker: 'id' },
      exportPolicy: 'unavailable',
      retentionClass: 'financial-report',
      sources: { p309: 'unintegrated' },
    },
  },
};

export function resolveReportAvailability(
  definition: ReportDefinition,
  observed: Partial<Record<ReportSourceKey, 'fresh' | 'stale' | 'missing'>>,
): ReportAvailability {
  let partial = false;
  let hasAvailableRequiredSource = false;
  for (const [source, requirement] of Object.entries(definition.sources) as Array<
    [ReportSourceKey, ReportSourceRequirement]
  >) {
    const state = observed[source] ?? 'missing';
    if (requirement === 'unintegrated') {
      partial = true;
      continue;
    }
    if (requirement === 'required' && state === 'missing') return 'unavailable';
    if (requirement === 'required' && state !== 'missing') hasAvailableRequiredSource = true;
    if (state !== 'fresh') partial = true;
  }
  if (!hasAvailableRequiredSource) return 'unavailable';
  return partial ? 'partial' : 'ready';
}
