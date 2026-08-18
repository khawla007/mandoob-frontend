import type { DocumentCenterRow } from '@/lib/data/pro-document-center';

export type PrimaryDocumentAction = 'approve' | 'open' | 'company' | 'history';
export type ReviewFeedbackTarget = 'row' | 'dialog';

export type PrimaryDocumentActionRow = Pick<
  DocumentCenterRow,
  'entityKind' | 'documentId' | 'versionId' | 'reviewStatus'
>;

export function resolvePrimaryDocumentAction(row: PrimaryDocumentActionRow): PrimaryDocumentAction {
  if (row.entityKind === 'request' || row.reviewStatus === 'rejected') return 'company';
  if (row.reviewStatus === 'pending' && row.versionId) return 'approve';
  if (row.reviewStatus === 'approved' && row.versionId) return 'open';
  if (row.versionId) return 'open';
  if (row.documentId) return 'history';
  return 'company';
}

export function resolveReviewFeedbackTarget(rejectDialogOpen: boolean): ReviewFeedbackTarget {
  return rejectDialogOpen ? 'dialog' : 'row';
}
