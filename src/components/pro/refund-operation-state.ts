export type DurableRefundOperation = {
  operationId: string;
  status: 'pending' | 'succeeded' | 'failed';
};

export function syncRefundOperationId(
  currentOperationId: string | null,
  durableOperation: DurableRefundOperation | null,
): string | null {
  if (!durableOperation) return currentOperationId;
  if (durableOperation.status === 'pending') return durableOperation.operationId;
  return currentOperationId === durableOperation.operationId ? null : currentOperationId;
}
