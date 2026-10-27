export function selectRefundablePayment(args: {
  currency: string;
  payments: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  refunds: Array<{ paymentId: string; amountMinor: number; status: string }>;
}): { paymentId: string; remainingMinor: number } | null {
  const candidates = args.payments
    .filter(
      (candidate) => candidate.status === 'succeeded' || candidate.status === 'partially_refunded',
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const payment of candidates) {
    if (payment.currency !== args.currency) continue;
    const reserved = args.refunds
      .filter((refund) => refund.paymentId === payment.id && refund.status !== 'failed')
      .reduce((total, refund) => total + refund.amountMinor, 0);
    const remainingMinor = payment.amountMinor - reserved;
    if (Number.isSafeInteger(remainingMinor) && remainingMinor > 0)
      return { paymentId: payment.id, remainingMinor };
  }
  return null;
}

export function canShowRefundAction(args: {
  detailsAvailable: boolean;
  remainingMinor: number | null;
  hasPendingRefund: boolean;
}): boolean {
  return (
    args.detailsAvailable &&
    (args.hasPendingRefund || (args.remainingMinor !== null && args.remainingMinor > 0))
  );
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
