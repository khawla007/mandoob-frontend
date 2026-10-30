export type StripeIntent = {
  operationId: string;
  effectKey: string;
  effectToken: string | null;
  providerPriceId: string | null;
  state: 'reserved' | 'effect_unknown' | 'attached' | 'failed' | 'reconciled';
  providerReference: string | null;
  redirectUrl: string | null;
};

type Effect = { reference: string; url: string | null };
export type StripeEffectDependencies = {
  reserve(): Promise<StripeIntent>;
  create(
    intent: StripeIntent,
  ): Promise<
    | { ok: true; effect: Effect }
    | { ok: false; retryable: boolean; code: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_REJECTED' }
  >;
  attach(intent: StripeIntent, effect: Effect): Promise<StripeIntent>;
  markUnknown(code: string): Promise<void>;
};

export type StripeEffectOutcome =
  | { ok: true; reference: string; redirectUrl: string | null; replayed: boolean }
  | { ok: false; code: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_REJECTED' };

export async function runStripeEffect(
  deps: StripeEffectDependencies,
): Promise<StripeEffectOutcome> {
  const intent = await deps.reserve();
  if (intent.providerReference && ['attached', 'reconciled'].includes(intent.state))
    return {
      ok: true,
      reference: intent.providerReference,
      redirectUrl: intent.redirectUrl,
      replayed: true,
    };
  const result = await deps.create(intent);
  if (!result.ok) {
    if (result.retryable) await deps.markUnknown(result.code);
    return { ok: false, code: result.code };
  }
  const attached = await deps.attach(intent, result.effect);
  return {
    ok: true,
    reference: attached.providerReference!,
    redirectUrl: attached.redirectUrl,
    replayed: false,
  };
}
