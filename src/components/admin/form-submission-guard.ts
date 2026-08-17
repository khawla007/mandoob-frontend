export type SubmissionLatch = { current: boolean };

export function claimFormSubmission(latch: SubmissionLatch): boolean {
  if (latch.current) return false;
  latch.current = true;
  return true;
}

export function releaseFormSubmission(latch: SubmissionLatch): void {
  latch.current = false;
}
