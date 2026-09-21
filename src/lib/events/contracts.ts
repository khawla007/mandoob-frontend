import { createHash } from 'node:crypto';
import { z } from 'zod';

export const EVENT_INTERFACE_VERSION = '1.0.0' as const;

const uuidSchema = z.string().uuid();
const eventTypeSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/);

const sensitivePayloadKeyPattern =
  /(authorization|cookie|credential|email|emirates.?id|header|message|mobile|national.?id|passport|password|phone|raw.?response|secret|signature|token)/i;
const emailValuePattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phoneValuePattern = /(?:\+|00)\d[\d\s().-]{7,}\d/;
const credentialValuePattern = /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/i;
const opaqueReferencePattern = /^(?:[a-f0-9]{64}|[0-9a-f]{8}-[0-9a-f-]{27,})$/i;

function payloadContainsProtectedMaterial(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(payloadContainsProtectedMaterial);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(
      ([key, nested]) =>
        sensitivePayloadKeyPattern.test(key) || payloadContainsProtectedMaterial(nested),
    );
  }
  if (typeof value !== 'string' || opaqueReferencePattern.test(value)) return false;
  return (
    emailValuePattern.test(value) ||
    phoneValuePattern.test(value) ||
    credentialValuePattern.test(value)
  );
}

export const eventPrivacyClassSchema = z.enum(['public', 'internal', 'confidential', 'restricted']);

export const domainEventEnvelopeSchema = z
  .object({
    eventId: uuidSchema,
    eventType: eventTypeSchema,
    eventVersion: z.number().int().min(1).max(32_767),
    occurredAt: z.string().datetime({ offset: true }),
    tenantId: uuidSchema.nullable(),
    companyId: uuidSchema.nullable(),
    actorId: uuidSchema.nullable(),
    correlationId: uuidSchema,
    causationId: uuidSchema.nullable(),
    privacyClass: eventPrivacyClassSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.companyId && !value.tenantId) {
      context.addIssue({
        code: 'custom',
        path: ['tenantId'],
        message: 'tenantId is required when companyId is present',
      });
    }
    if (payloadContainsProtectedMaterial(value.payload)) {
      context.addIssue({
        code: 'custom',
        path: ['payload'],
        message: 'payload must contain opaque references and non-sensitive state only',
      });
    }
  });

export type DomainEventEnvelope = z.infer<typeof domainEventEnvelopeSchema>;

export function parseRegisteredDomainEvent(
  input: unknown,
  registrations: Readonly<Record<string, readonly number[]>>,
): DomainEventEnvelope {
  const envelope = domainEventEnvelopeSchema.parse(input);
  if (!registrations[envelope.eventType]?.includes(envelope.eventVersion)) {
    throw new Error('EVENT_VERSION_UNSUPPORTED');
  }
  return envelope;
}

const providerErrorCategorySchema = z.enum([
  'authentication',
  'configuration',
  'invalid_recipient',
  'invalid_template',
  'rate_limited',
  'provider_unavailable',
  'timeout',
  'rejected',
  'unknown',
]);

const safeProviderFailureSchema = z
  .object({
    category: providerErrorCategorySchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    retryable: z.boolean(),
  })
  .strip();

export type SafeProviderFailure = z.infer<typeof safeProviderFailureSchema>;

export type ProviderDeliveryRequest<TPayload> = {
  effectKey: string;
  payload: TPayload;
};

export type ProviderDeliveryResult =
  | { ok: true; effectReferenceHash?: string }
  | { ok: false; failure: SafeProviderFailure };

export interface ProviderAdapter<TPayload> {
  deliver(request: ProviderDeliveryRequest<TPayload>): Promise<ProviderDeliveryResult>;
}

export function toSafeProviderFailure(input: unknown): SafeProviderFailure {
  const parsed = safeProviderFailureSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  return { category: 'unknown', code: 'PROVIDER_FAILURE', retryable: false };
}

export function createProviderEffectKey(jobId: string): string {
  return `mandoob:event-job:${uuidSchema.parse(jobId)}`;
}

export function retryDelayMs(
  eventId: string,
  attempt: number,
  options: { baseMs?: number; capMs?: number; jitterRatio?: number } = {},
): number {
  uuidSchema.parse(eventId);
  const safeAttempt = Math.max(1, Math.min(Math.trunc(attempt), 63));
  const baseMs = options.baseMs ?? 120_000;
  const capMs = options.capMs ?? 3_600_000;
  const jitterRatio = options.jitterRatio ?? 0.2;
  const rawDelay = Math.min(baseMs * 2 ** (safeAttempt - 1), capMs);
  const hashPrefix = createHash('sha256')
    .update(`${eventId}:${safeAttempt}`)
    .digest()
    .readUInt32BE(0);
  const unit = hashPrefix / 0xffffffff;
  const jitter = (unit * 2 - 1) * jitterRatio;
  return Math.min(capMs, Math.max(0, Math.round(rawDelay * (1 + jitter))));
}

function normalizeDestinationKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLowerCase();
}

export function hashDestinationKey(provider: string, destinationKey: string): string {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedKey = normalizeDestinationKey(destinationKey);
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(normalizedProvider) || normalizedKey.length < 3) {
    throw new Error('INVALID_DESTINATION_KEY');
  }
  return createHash('sha256').update(`${normalizedProvider}\0${normalizedKey}`).digest('hex');
}

export function isWebhookTimestampWithinTolerance(
  timestamp: string,
  nowMs: number = Date.now(),
  toleranceMs: number = 300_000,
): boolean {
  const timestampMs = Date.parse(timestamp);
  return (
    Number.isFinite(timestampMs) &&
    Number.isFinite(nowMs) &&
    toleranceMs >= 0 &&
    Math.abs(nowMs - timestampMs) <= toleranceMs
  );
}
