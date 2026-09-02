export function remainingRefundableMinor(args: {
  currency: string;
  payments: Array<{ amountMinor: number; currency: string; status: string }>;
  refunds: Array<{ amountMinor: number; currency: string; status: string }>;
}): number {
  const successful = args.payments
    .filter((payment) => payment.status === 'succeeded' && payment.currency === args.currency)
    .reduce((total, payment) => total + payment.amountMinor, 0);
  const settled = args.refunds
    .filter((refund) => refund.status === 'succeeded' && refund.currency === args.currency)
    .reduce((total, refund) => total + refund.amountMinor, 0);
  return Math.max(0, successful - settled);
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
