/** Cancel is allowed before execution and, as a batch-boundary fence, while importing. */
export function isImportJobCancellable(status: string, cancelRequested = false): boolean {
  if (status === 'importing') return !cancelRequested;
  return status === 'uploaded' || status === 'validating' || status === 'validated';
}
