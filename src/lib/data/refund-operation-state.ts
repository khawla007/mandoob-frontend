export type RefundOperationState = {
  paymentId: string;
  operationId: string;
  status: 'pending' | 'succeeded' | 'failed';
  amountMinor: number;
  reason: string | null;
};

export function refundOperationFromRow(row: {
  payment_id?: string | null;
  idempotency_key?: string | null;
  status?: string | null;
  amount_minor?: number | null;
  reason?: string | null;
}): RefundOperationState | null {
  if (
    !row.payment_id ||
    !row.idempotency_key ||
    (row.status !== 'pending' && row.status !== 'succeeded' && row.status !== 'failed') ||
    !Number.isSafeInteger(row.amount_minor) ||
    (row.amount_minor ?? 0) <= 0
  )
    return null;
  return {
    paymentId: row.payment_id,
    operationId: row.idempotency_key,
    status: row.status,
    amountMinor: row.amount_minor as number,
    reason: row.reason ?? null,
  };
}
