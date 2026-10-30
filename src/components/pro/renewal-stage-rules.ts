import type { RenewalStage } from '@/lib/validation/renewal';

/** Mirrors `private.p308_apply_renewal_transition`; the database remains authoritative. */
export const NEXT_RENEWAL_STAGES: Record<RenewalStage, RenewalStage[]> = {
  due: ['in_progress', 'cancelled'],
  in_progress: ['documents_submitted', 'cancelled'],
  documents_submitted: ['government_processing', 'in_progress', 'cancelled'],
  government_processing: ['completed', 'documents_submitted', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const EVIDENCE_STAGES: RenewalStage[] = ['documents_submitted', 'completed'];
export const CANCEL_REASONS = ['duplicate_entry', 'not_required', 'handled_elsewhere'] as const;
export const BLOCKER_CODES = [
  'awaiting_documents',
  'awaiting_payment',
  'awaiting_government',
  'awaiting_medical',
] as const;

export function toMinorUnits(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  if (!/^\d{1,9}(\.\d{1,2})?$/u.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function fromMinorUnits(value: number): string {
  return (value / 100).toFixed(2);
}
