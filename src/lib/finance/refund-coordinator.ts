export type RefundEffect = {
  status: 'pending' | 'succeeded' | 'failed';
  providerRefundId: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; code: string };
type Persistence<TAttached, TTerminal> = {
  attachPending(): Promise<Result<TAttached>>;
  reconcileTerminal(attached?: TAttached): Promise<Result<TTerminal>>;
};

export async function persistRefundEffect<TAttached, TTerminal = TAttached>(
  effect: RefundEffect,
  persistence: Persistence<TAttached, TTerminal>,
): Promise<Result<TAttached | TTerminal>> {
  if (effect.providerRefundId) {
    const attached = await persistence.attachPending();
    if (!attached.ok || effect.status === 'pending') return attached;
    return persistence.reconcileTerminal(attached.data);
  }
  if (effect.status === 'pending') return { ok: false as const, code: 'UNAVAILABLE' as const };
  return persistence.reconcileTerminal();
}
