import type { LeadStage } from '@/lib/data/leads-kanban';
import type { LeadFunnelDatum } from './contracts';

export const DASHBOARD_LEAD_STAGES = [
  'new',
  'contacted',
  'qualified',
  'won',
  'lost',
] as const satisfies readonly LeadStage[];

export function calculatePercentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export function calculateDelta(
  current: number,
  previous: number,
): { kind: 'data'; percentage: number } | { kind: 'unavailable' } {
  if (previous === 0) return { kind: 'unavailable' };
  return { kind: 'data', percentage: Math.round(((current - previous) / previous) * 1000) / 10 };
}

export function orderLeadStageCounts(
  counts: Partial<Record<LeadStage, number>>,
): LeadFunnelDatum[] {
  const total = DASHBOARD_LEAD_STAGES.reduce((sum, stage) => sum + (counts[stage] ?? 0), 0);
  return DASHBOARD_LEAD_STAGES.map((stage) => {
    const count = counts[stage] ?? 0;
    return { stage, count, percentage: calculatePercentage(count, total) };
  });
}

export function deriveAssignmentCounts(input: {
  activePros: number;
  companies: number;
  activeAssignments: number;
}): { unassignedPros: number; unassignedCompanies: number } {
  if (input.activeAssignments > input.activePros || input.activeAssignments > input.companies) {
    throw new Error('Assignment invariant violated');
  }
  return {
    unassignedPros: input.activePros - input.activeAssignments,
    unassignedCompanies: input.companies - input.activeAssignments,
  };
}

export function deriveUnassignedCount(total: number, activeAssignments: number): number {
  if (activeAssignments > total) throw new Error('Assignment invariant violated');
  return total - activeAssignments;
}

export function resolveProHealth(assignment: { companyName: string } | null): {
  state: 'assigned' | 'unassigned';
  companyName: string | null;
} {
  return assignment
    ? { state: 'assigned', companyName: assignment.companyName }
    : { state: 'unassigned', companyName: null };
}
