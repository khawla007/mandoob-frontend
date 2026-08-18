export type RefundWorkflowInput = {
  tenantId: string;
  companyId: string;
  invoiceId: string;
  actorId: string;
  amountMinor: number;
  reason: string;
  ip: string;
  idempotencyKey: string;
};

export type RefundIntent = {
  refundId: string;
  paymentId: string;
  provider: string;
  providerChargeId: string | null;
  providerIdempotencyKey: string;
  status: 'pending' | 'succeeded' | 'failed';
  currency: string;
};

type ProviderResult =
  | { ok: true; providerRefundId: string | null; status: 'pending' | 'succeeded' }
  | { ok: false; error: string; retryable: boolean };

type ReconciledRefund = {
  refundId: string;
  partial: boolean;
  status: 'pending' | 'succeeded' | 'failed';
};

export type RefundWorkflowDeps = {
  prepare(input: RefundWorkflowInput): Promise<RefundIntent>;
  callProvider(intent: RefundIntent, input: RefundWorkflowInput): Promise<ProviderResult>;
  reconcile(args: {
    intent: RefundIntent;
    input: RefundWorkflowInput;
    providerRefundId: string | null;
    status: 'pending' | 'succeeded' | 'failed';
  }): Promise<ReconciledRefund>;
};

export async function executeIdempotentRefund(
  input: RefundWorkflowInput,
  deps: RefundWorkflowDeps,
): Promise<({ ok: true } & ReconciledRefund) | { ok: false; error: string; retryable: boolean }> {
  const intent = await deps.prepare(input);
  if (intent.status === 'succeeded') {
    const reconciled = await deps.reconcile({
      intent,
      input,
      providerRefundId: null,
      status: 'succeeded',
    });
    return { ok: true, ...reconciled };
  }
  if (intent.status === 'failed') {
    return { ok: false, error: 'Refund operation already failed', retryable: false };
  }

  const provider = await deps.callProvider(intent, input);
  if (!provider.ok) {
    if (!provider.retryable) {
      await deps.reconcile({ intent, input, providerRefundId: null, status: 'failed' });
    }
    return provider;
  }
  const reconciled = await deps.reconcile({
    intent,
    input,
    providerRefundId: provider.providerRefundId,
    status: provider.status,
  });
  return { ok: true, ...reconciled };
}
