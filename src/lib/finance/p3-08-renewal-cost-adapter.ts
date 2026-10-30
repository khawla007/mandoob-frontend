import { z } from 'zod';
import { isIsoCurrency } from './money';

export const P308_RENEWAL_COST_INTERFACE_VERSION = 1 as const;

const frozenAmountMinorSchema = z.number().int().safe().min(0).max(100_000_000_000);

const p308RenewalCostFactSchema = z
  .object({
    interfaceVersion: z.literal(P308_RENEWAL_COST_INTERFACE_VERSION),
    renewalId: z.string().uuid(),
    tenantId: z.string().uuid(),
    companyId: z.string().uuid(),
    renewalVersion: z.number().int().safe().min(1),
    governmentFeeMinor: frozenAmountMinorSchema,
    proServiceFeeMinor: frozenAmountMinorSchema,
    fineMinor: frozenAmountMinorSchema,
    currency: z.string().refine(isIsoCurrency, 'unsupported ISO-4217 currency'),
  })
  .strict();

export type P308RenewalCostFact = z.infer<typeof p308RenewalCostFactSchema>;
export type P309RenewalCostProjection = P308RenewalCostFact & { totalMinor: number };

/**
 * Consumes P3.08's frozen cost values without taking ownership of renewal state.
 * The returned object contains references and integer minor-unit facts only.
 */
export function parseP308RenewalCostFact(input: unknown): P309RenewalCostProjection {
  if (
    typeof input !== 'object' ||
    input === null ||
    (input as { interfaceVersion?: unknown }).interfaceVersion !==
      P308_RENEWAL_COST_INTERFACE_VERSION
  ) {
    throw new Error('RENEWAL_COST_INTERFACE_UNSUPPORTED');
  }

  const fact = p308RenewalCostFactSchema.parse(input);
  const total =
    BigInt(fact.governmentFeeMinor) + BigInt(fact.proServiceFeeMinor) + BigInt(fact.fineMinor);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('RENEWAL_COST_TOTAL_OVERFLOW');
  }

  return { ...fact, totalMinor: Number(total) };
}
