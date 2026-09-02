export function remainingRefundableMinor(args: {
  currency: string;
  payments: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  refunds: Array<{ paymentId: string; amountMinor: number; status: string }>;
}): number | null {
  const payment = args.payments
    .filter(
      (candidate) => candidate.status === 'succeeded' || candidate.status === 'partially_refunded',
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  if (!payment || payment.currency !== args.currency) return null;
  const reserved = args.refunds
    .filter((refund) => refund.paymentId === payment.id && refund.status !== 'failed')
    .reduce((total, refund) => total + refund.amountMinor, 0);
  return Math.max(0, payment.amountMinor - reserved);
}

export function resolveInvoiceFinanceSections(args: {
  payments: boolean;
  refunds: boolean;
  refundOperation: boolean;
  audit: boolean;
}) {
  const refundDependenciesAvailable = args.payments && args.refunds && args.refundOperation;
  return {
    payments: args.payments ? ('available' as const) : ('unavailable' as const),
    refunds: refundDependenciesAvailable ? ('available' as const) : ('unavailable' as const),
    refundOperation: refundDependenciesAvailable
      ? ('available' as const)
      : ('unavailable' as const),
    audit: args.audit ? ('available' as const) : ('unavailable' as const),
  };
}
