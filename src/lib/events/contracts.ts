import { createHash, createHmac } from 'node:crypto';
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

const eventPayloadFieldKindSchema = z.enum([
  'boolean',
  'integer',
  'reference',
  'sha256',
  'state',
  'uuid',
]);
export type EventPayloadFieldKind = z.infer<typeof eventPayloadFieldKindSchema>;
export type EventPayloadSchema = Readonly<Record<string, EventPayloadFieldKind>>;
export type EventSchemaRegistry = Readonly<
  Record<string, Readonly<Record<number, EventPayloadSchema>>>
>;

const payloadFieldSchemas: Record<EventPayloadFieldKind, z.ZodType> = {
  boolean: z.boolean(),
  integer: z.number().int().safe(),
  reference: z.string().regex(/^[a-z0-9][a-z0-9:_-]{2,127}$/i),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  uuid: uuidSchema,
};

function payloadMatchesSchema(
  payload: Record<string, unknown>,
  schema: EventPayloadSchema,
): boolean {
  const schemaEntries = Object.entries(schema);
  if (
    Object.keys(payload).length !== schemaEntries.length ||
    schemaEntries.some(([key]) => !Object.hasOwn(payload, key))
  ) {
    return false;
  }
  return schemaEntries.every(([key, kind]) => {
    const parsedKind = eventPayloadFieldKindSchema.safeParse(kind);
    return (
      parsedKind.success && payloadFieldSchemas[parsedKind.data].safeParse(payload[key]).success
    );
  });
}

export function parseRegisteredDomainEvent(
  input: unknown,
  registrations: EventSchemaRegistry,
): DomainEventEnvelope {
  const envelope = domainEventEnvelopeSchema.parse(input);
  const payloadSchema = registrations[envelope.eventType]?.[envelope.eventVersion];
  if (!payloadSchema) {
    throw new Error('EVENT_VERSION_UNSUPPORTED');
  }
  if (!payloadMatchesSchema(envelope.payload, payloadSchema)) {
    throw new Error('EVENT_PAYLOAD_SCHEMA_INVALID');
  }
  return envelope;
}

const providerErrorCategorySchema = z.enum([
  'malformed_payload',
  'unsupported_version',
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
    code: z.enum([
      'EVENT_PAYLOAD_INVALID',
      'EVENT_VERSION_UNSUPPORTED',
      'PROVIDER_AUTHENTICATION_FAILED',
      'PROVIDER_CONFIGURATION_INVALID',
      'PROVIDER_FAILURE',
      'PROVIDER_RATE_LIMITED',
      'PROVIDER_RECIPIENT_INVALID',
      'PROVIDER_REJECTED',
      'PROVIDER_TEMPLATE_INVALID',
      'PROVIDER_TIMEOUT',
      'PROVIDER_UNAVAILABLE',
    ]),
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

export function retryDelayMs(jobId: string, attempt: number): number {
  uuidSchema.parse(jobId);
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 25) {
    throw new Error('INVALID_RETRY_ATTEMPT');
  }
  const rawDelay = Math.min(120_000 * 2 ** (attempt - 1), 3_600_000);
  const hashPrefix = createHash('sha256').update(`${jobId}:${attempt}`).digest().readUInt32BE(0);
  const unit = hashPrefix / 0xffffffff;
  const jitter = (unit * 2 - 1) * 0.2;
  return Math.min(3_600_000, Math.max(0, Math.round(rawDelay * (1 + jitter))));
}

function normalizeDestinationKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLowerCase();
}

export function hashDestinationKey(
  provider: string,
  destinationKey: string,
  secret: string | undefined = process.env.INBOUND_DESTINATION_HMAC_SECRET,
): string {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedKey = normalizeDestinationKey(destinationKey);
  if (
    !/^[a-z][a-z0-9_-]{1,31}$/.test(normalizedProvider) ||
    normalizedKey.length < 3 ||
    !secret ||
    secret.length < 32
  ) {
    throw new Error('INVALID_DESTINATION_KEY');
  }
  return `v1:${createHmac('sha256', secret)
    .update(`${normalizedProvider}\0${normalizedKey}`)
    .digest('hex')}`;
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
