export type RefundLedgerState = {
  settlesImmediately: boolean;
  isFull: boolean;
  invoiceStatus: 'refunded' | 'partially_refunded' | null;
  paymentStatus: 'refunded' | 'partially_refunded' | null;
};

export function canRefundPaymentStatus(status: string): boolean {
  return status === 'succeeded' || status === 'partially_refunded';
}

export function resolveRefundLedgerState(args: {
  refundStatus: 'pending' | 'succeeded' | 'failed';
  amountMinor: number;
  remainingMinor: number;
}): RefundLedgerState {
  const settlesImmediately = args.refundStatus === 'succeeded';
  const isFull = args.amountMinor >= args.remainingMinor;
  if (!settlesImmediately) {
    return { settlesImmediately, isFull, invoiceStatus: null, paymentStatus: null };
  }
  return {
    settlesImmediately,
    isFull,
    invoiceStatus: isFull ? 'refunded' : 'partially_refunded',
    paymentStatus: isFull ? 'refunded' : 'partially_refunded',
  };
}
