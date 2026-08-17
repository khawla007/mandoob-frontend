export function companyAssignmentFormIdentity(assignmentId: string | null | undefined): string {
  return assignmentId ?? 'unassigned';
}
