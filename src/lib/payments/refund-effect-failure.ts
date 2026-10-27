export async function reconcileTerminalTapRefundFailure(
  retryable: boolean,
  reconcile: (input: { providerRefundId: null; status: 'failed' }) => Promise<void>,
): Promise<'pending' | 'failed'> {
  if (retryable) return 'pending';
  await reconcile({ providerRefundId: null, status: 'failed' });
  return 'failed';
}
