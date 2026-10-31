# Phase 3 Launch Security Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four Medium Phase 3 launch security findings with test-first SMTP shutdown, fail-closed rate limiting, bounded ingress, and atomic monotonic delivery callbacks.

**Architecture:** Four isolated boundaries protect outbound network selection, abuse-control availability, inbound body buffering, and provider status persistence. Application code uses shared typed helpers; a forward-only PostgreSQL migration owns callback ordering and replay under row locks.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Node test runner, Zod, Supabase/PostgreSQL 17, PL/pgSQL, Nodemailer/Resend, Netlify.

---

## File Structure

- `src/lib/mail/sender.ts`: platform-only sender resolution; tenant SMTP is never constructed.
- `src/lib/mail/sender.test.ts`: SMTP shutdown and zero-Nodemailer regressions.
- `src/lib/validation/tenant-settings.ts`: launch-unavailable SMTP mutation schema.
- `src/app/(tenant)/t/[tenant]/(pro)/settings/actions.ts`: stable SMTP-unavailable server action.
- `src/lib/data/tenant-settings.ts`: authoritative application-side SMTP mutation denial.
- `supabase/migrations/20261031005000_0125_atomic_rate_limit_pair.sql`: atomic two-bucket rate-limit consumption.
- `supabase/migrations/20261031010000_0126_launch_security_wave_1.sql`: database SMTP mutation denial and atomic delivery receipt RPC.
- `supabase/tests/launch_security_wave_1.sql`: transactional SMTP and callback replay/order/grant proof.
- `src/lib/rate-limit/index.ts`: typed fail-closed limiter core and compatibility wrapper.
- `src/lib/rate-limit/sensitive.test.ts`: limiter error/malformed/exception/redaction regressions.
- `src/lib/rate-limit/legacy-route-audit.test.ts`: source audit proving auth/public routes use typed decisions.
- Existing auth/public/admin routes listed in Task 3: decision-aware response mapping.
- `src/lib/http/bounded-body.ts`: actual-byte streaming reader and typed overflow error.
- `src/lib/http/bounded-body.test.ts`: byte, chunking, cancellation, and content-length proof.
- `src/lib/http/bounded-ingress-audit.test.ts`: source audit for all public/webhook body consumers.
- Existing public/webhook handlers listed in Task 5: bounded reads before parsing/signature verification.
- `src/lib/events/provider-delivery-status.ts`: typed RPC adapter shared by Twilio, Unifonic, and WhatsApp.
- `src/lib/events/provider-delivery-status.test.ts`: adapter contract and fail-closed result parsing.
- Existing provider webhook handlers listed in Task 7: no direct delivery-state writes.
- `scripts/run-sql-integration.sh`: include the Wave 1 SQL fixture.
- `Reports/.../penetration-security-retest.md` and related evidence outside the frontend repository: immutable Wave 1 results after verification.

### Task 1: Disable tenant-controlled SMTP at every application boundary

**Files:**
- Modify: `src/lib/mail/sender.ts`
- Modify: `src/lib/mail/sender.test.ts`
- Modify: `src/lib/validation/tenant-settings.ts`
- Modify: `src/lib/validation/tenant-settings.test.ts`
- Modify: `src/app/(tenant)/t/[tenant]/(pro)/settings/actions.ts`
- Modify: `src/lib/data/tenant-settings.ts`
- Modify: `src/lib/data/tenant-settings.test.ts`

- [ ] **Step 1: Write RED tests for platform-only transport and SMTP mutation denial**

Add tests that assert:

```ts
test('tenant sender resolution uses only the platform transport', async () => {
  const sender = await resolveSenderForTenant('tenant-id', {
    readTenant: async () => ({ email_sender_name: 'Acme', email_reply_to: null }),
  });
  assert.equal(sender.transport, 'resend');
});

test('SMTP mutation is launch unavailable before RPC execution', async () => {
  let calls = 0;
  const result = await mutateAssignedCompanySettings(
    context,
    'smtp',
    operation,
    smtpInput,
    'ciphertext',
    'a'.repeat(64),
    { supabase: { rpc: async () => { calls += 1; return { data: null, error: null }; } } },
  );
  assert.deepEqual(result, { ok: false, code: 'SETTINGS_UNAVAILABLE', errorKey: 'unavailable' });
  assert.equal(calls, 0);
});
```

Add `smtpMutationSchema` coverage proving any SMTP save attempt returns the launch-unavailable issue while `smtpSchema` continues parsing stored redacted rows.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
node --conditions=react-server --import tsx --test src/lib/mail/sender.test.ts src/lib/validation/tenant-settings.test.ts src/lib/data/tenant-settings.test.ts
```

Expected: FAIL because SMTP is still constructed and `SETTINGS_UNAVAILABLE` is not defined.

- [ ] **Step 3: Implement the platform-only sender and typed SMTP denial**

Add the error code mapping:

```ts
type SettingsErrorCode =
  | 'SETTINGS_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'INVALID_SETTINGS_INPUT'
  | 'SETTINGS_OPERATION_CONFLICT'
  | 'STALE_SETTINGS_VERSION'
  | 'SETTINGS_CREDENTIAL_REQUIRED'
  | 'SETTINGS_SAVE_FAILED';

const errorKeys: Record<SettingsErrorCode, SettingsErrorKey> = {
  SETTINGS_UNAVAILABLE: 'unavailable',
  // preserve the existing mappings unchanged
};
```

Keep `smtpSchema` for stored-row parsing and export a mutation schema that always produces the stable unavailable issue for UI/form validation:

```ts
export const smtpMutationSchema = z.unknown().superRefine((_input, context) => {
  context.addIssue({
    code: 'custom',
    message: 'Tenant SMTP is unavailable for launch',
  });
});
```

In `mutateAssignedCompanySettings`, return `settingsFailure('SETTINGS_UNAVAILABLE')` before credential encryption or RPC work when `section === 'smtp'`. In `updateSmtpAction`, return the same stable result before authorization or mutation.

Refactor `resolveSenderForTenant` to accept injectable reads in tests, remove the SMTP credential query/decryption from the production path, and always return:

```ts
const cfg = buildSenderConfig(tenant ?? null);
return resendSender(cfg.from, cfg.replyTo);
```

Delete `smtpSender`, the Nodemailer import, and the SMTP password decryption path only after the RED test proves no construction is possible. Do not delete stored SMTP rows or credentials.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the Step 2 command.

Expected: PASS; no SMTP transport construction and no SMTP mutation RPC call.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mail/sender.ts src/lib/mail/sender.test.ts src/lib/validation/tenant-settings.ts src/lib/validation/tenant-settings.test.ts 'src/app/(tenant)/t/[tenant]/(pro)/settings/actions.ts' src/lib/data/tenant-settings.ts src/lib/data/tenant-settings.test.ts
git commit -m "fix: disable tenant smtp for launch"
```

### Task 2: Add a typed fail-closed legacy rate-limit core

**Files:**
- Modify: `src/lib/rate-limit/index.ts`
- Modify: `src/lib/rate-limit/sensitive.test.ts`

- [ ] **Step 1: Write RED decision tests**

Cover `true`, `false`, RPC error, thrown exception, `null`, string data, and redacted diagnostics:

```ts
test('legacy limiter treats RPC failure as unavailable without logging the key', async () => {
  const logs: unknown[][] = [];
  const decision = await consumeRateLimitDecision(
    { key: 'login:private-ip', capacity: 1, refillPerSec: 1, routeLabel: 'login', correlationId: 'cid' },
    { consume: async () => ({ data: null, error: new Error('secret') }), log: (...args) => logs.push(args) },
  );
  assert.equal(decision, 'unavailable');
  assert.doesNotMatch(JSON.stringify(logs), /private-ip|secret/u);
});
```

- [ ] **Step 2: Run the limiter test and confirm RED**

```bash
node --import tsx --test src/lib/rate-limit/sensitive.test.ts
```

Expected: FAIL because `consumeRateLimitDecision` does not exist and the boolean limiter fails open.

- [ ] **Step 3: Implement the typed core and fail-closed compatibility wrapper**

Add:

```ts
export type RateLimitDecision = 'allowed' | 'limited' | 'unavailable';

export async function consumeRateLimitDecision(
  cfg: SensitiveRateLimitConfig,
  deps: SensitiveRateLimitDeps = {},
): Promise<RateLimitDecision> {
  const consume = deps.consume ?? defaultConsume;
  try {
    const { data, error } = await consume(cfg);
    if (error || typeof data !== 'boolean') {
      (deps.log ?? console.error)('rate-limit unavailable', {
        routeLabel: cfg.routeLabel,
        correlationId: cfg.correlationId,
      });
      return 'unavailable';
    }
    return data ? 'allowed' : 'limited';
  } catch {
    (deps.log ?? console.error)('rate-limit unavailable', {
      routeLabel: cfg.routeLabel,
      correlationId: cfg.correlationId,
    });
    return 'unavailable';
  }
}
```

Make `consumeSensitiveRateLimit` delegate to this core. Preserve `consumeRateLimit` temporarily for non-ingress callers, but make it fail closed:

```ts
export async function consumeRateLimit(cfg: RateLimitConfig): Promise<boolean> {
  return (await consumeRateLimitDecision({ ...cfg, routeLabel: 'legacy', correlationId: 'none' })) === 'allowed';
}
```

- [ ] **Step 4: Run the limiter test and confirm GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit/index.ts src/lib/rate-limit/sensitive.test.ts
git commit -m "fix: fail closed when rate limiting is unavailable"
```

### Task 3: Migrate authentication and public callers to typed limiter decisions

**Files:**
- Create: `src/lib/rate-limit/legacy-route-audit.test.ts`
- Create: `src/lib/rate-limit/legacy-route-unavailable.test.ts`
- Create: `src/lib/rate-limit/atomic-pair-migration.test.ts`
- Create: `supabase/migrations/20261031005000_0125_atomic_rate_limit_pair.sql`
- Create: `supabase/tests/atomic_rate_limit_pair.sql`
- Modify: `src/lib/rate-limit/index.ts`
- Modify: `src/lib/rate-limit/sensitive.test.ts`
- Modify: `scripts/run-sql-integration.sh`
- Modify: `src/app/api/v1/auth/check-username/route.ts`
- Modify: `src/app/api/v1/auth/forgot-password/route.ts`
- Modify: `src/app/api/v1/auth/invite/accept/route.ts`
- Modify: `src/app/api/v1/auth/login/route.ts`
- Modify: `src/app/api/v1/auth/mfa/enroll/route.ts`
- Modify: `src/app/api/v1/auth/mfa/recovery/route.ts`
- Modify: `src/app/api/v1/auth/mfa/verify/route.ts`
- Modify: `src/app/api/v1/auth/phone-otp/start/route.ts`
- Modify: `src/app/api/v1/auth/register/route.ts`
- Modify: `src/app/api/v1/auth/resend-otp/route.ts`
- Modify: `src/app/api/v1/auth/reset-password/route.ts`
- Modify: `src/app/api/v1/auth/verify-otp/route.ts`
- Modify: `src/app/api/v1/public/estimate/pdf/route.ts`
- Modify: `src/lib/data/erasure.ts`

- [ ] **Step 1: Write a RED source-audit and representative runtime tests**

The audit enumerates the files above and asserts they import `consumeRateLimitDecision`, handle both `'limited'` and `'unavailable'`, and do not call `consumeRateLimit(`. Extend login, registration, reset-password, estimate-PDF, and erasure tests to inject unavailable decisions and assert downstream auth/provider/RPC callbacks remain at zero calls.

- [ ] **Step 2: Run the audit and representative tests and confirm RED**

```bash
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  src/lib/rate-limit/sensitive.test.ts \
  src/lib/rate-limit/atomic-pair-migration.test.ts \
  src/lib/rate-limit/legacy-route-audit.test.ts \
  src/lib/rate-limit/legacy-route-unavailable.test.ts \
  src/components/auth/mfa-contracts.test.ts \
  src/app/api/v1/auth/mfa/enroll/route-safety.test.ts
```

Expected: FAIL because the MFA routes do not yet have pre-auth limiter decisions, erasure still consumes two buckets sequentially, the atomic pair migration is missing, and the transpiled route tests reach poisoned session/provider dependencies when the limiter is unavailable.

- [ ] **Step 3: Migrate every enumerated caller**

Use this exact decision shape in API routes, with the existing per-route key/capacity values and a request correlation ID:

```ts
const limit = await consumeRateLimitDecision({
  key: `login:${ip}`,
  ...RATE_LIMITS.authLoginIp,
  routeLabel: 'auth-login',
  correlationId: request.headers.get('x-request-id') ?? crypto.randomUUID(),
});
if (limit === 'limited')
  return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
if (limit === 'unavailable')
  return errorResponse('RATE_LIMIT_UNAVAILABLE', 'Request protection is temporarily unavailable.', 503);
```

Sanitize request correlation headers through `rateLimitCorrelationId`; accept only canonical UUIDs and generate a server UUID for arbitrary, private, or oversized values.

For `erasure.ts`, consume the user and IP buckets with one `consumeRateLimitPairDecision` RPC so either-side denial subtracts cost from neither bucket. Throw `ApiError('RATE_LIMIT_UNAVAILABLE', 'Request protection is temporarily unavailable', 503)` on unavailable and preserve each existing 429 message for its corresponding limited side. Do not execute authentication, Turnstile, provider, or mutation work before the decision.

- [ ] **Step 4: Run the Step 2 test command and confirm GREEN**

```bash
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  src/lib/rate-limit/sensitive.test.ts \
  src/lib/rate-limit/atomic-pair-migration.test.ts \
  src/lib/rate-limit/legacy-route-audit.test.ts \
  src/lib/rate-limit/legacy-route-unavailable.test.ts \
  src/components/auth/mfa-contracts.test.ts \
  src/app/api/v1/auth/mfa/enroll/route-safety.test.ts
```

Expected: PASS for the atomic pair core/migration contract, complete route audit, real transpiled unavailable-route tests, and affected MFA contract/safety tests.

- [ ] **Step 5: Run TypeScript to catch any missed signature migration**

```bash
npx tsc --noEmit --incremental false
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rate-limit/index.ts src/lib/rate-limit/sensitive.test.ts src/lib/rate-limit/legacy-route-audit.test.ts src/lib/rate-limit/legacy-route-unavailable.test.ts src/lib/rate-limit/atomic-pair-migration.test.ts src/app/api/v1/auth src/app/api/v1/public/estimate/pdf/route.ts src/lib/data/erasure.ts supabase/migrations/20261031005000_0125_atomic_rate_limit_pair.sql supabase/tests/atomic_rate_limit_pair.sql scripts/run-sql-integration.sh
git commit -m "fix: gate auth and public work on limiter availability"
```

### Task 4: Build the shared bounded streaming body reader

**Files:**
- Create: `src/lib/http/bounded-body.ts`
- Create: `src/lib/http/bounded-body.test.ts`

- [ ] **Step 1: Write RED streaming-boundary tests**

Test declared overflow, missing/understated length, chunked overflow, exact limit, multibyte UTF-8, empty body, stream error, and cancellation. Use a custom `ReadableStream<Uint8Array>` whose `cancel()` toggles a boolean.

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
node --import tsx --test src/lib/http/bounded-body.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement actual-byte bounded reads**

Create:

```ts
import 'server-only';

export class BodyTooLargeError extends Error {
  readonly code = 'BODY_TOO_LARGE';
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new TypeError('invalid body limit');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes))
    throw new BodyTooLargeError('request body exceeds limit');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('body limit exceeded');
        throw new BodyTooLargeError('request body exceeds limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export const decodeBoundedUtf8 = (bytes: Uint8Array): string =>
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
```

Add helpers that parse JSON from bounded UTF-8 and reconstruct a bounded `Request` for multipart parsing without reading the original stream twice.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/http/bounded-body.ts src/lib/http/bounded-body.test.ts
git commit -m "feat: add bounded streaming request reader"
```

### Task 5: Migrate all public and webhook body consumers to bounded ingress

**Files:**
- Create: `src/lib/http/bounded-ingress-audit.test.ts`
- Modify: `src/app/api/v1/public/contact/handler.ts`
- Modify: `src/app/api/v1/public/applications/drafts/handler.ts`
- Modify: `src/app/api/v1/public/applications/drafts/[id]/handler.ts`
- Modify: `src/app/api/v1/public/applications/drafts/[id]/submit/handler.ts`
- Modify: `src/app/api/v1/public/applications/drafts/[id]/attachments/handler.ts`
- Modify: `src/app/api/v1/webhooks/tap/route.ts`
- Modify: `src/app/api/v1/webhooks/stripe/route.ts`
- Modify: `src/app/api/v1/webhooks/supabase-auth/route.ts`
- Modify: `src/app/api/v1/webhooks/twilio/route.ts`
- Modify: `src/app/api/v1/webhooks/unifonic/route.ts`
- Modify: `src/app/api/v1/webhooks/whatsapp/route.ts`
- Modify relevant existing route tests beside each handler.

- [ ] **Step 1: Write the RED ingress audit and overflow route tests**

The audit must enumerate every `request.json()`, `request.text()`, `request.arrayBuffer()`, and `request.formData()` occurrence under `auth`, `public`, and `webhooks`; allow only routes with no body or those using `readBoundedBody`. Add chunked overflow tests for contact, application JSON, multipart attachment, Tap, Stripe, Supabase Auth, Twilio, Unifonic, and WhatsApp.

- [ ] **Step 2: Run focused ingress tests and confirm RED**

```bash
node --import tsx --test src/lib/http/bounded-ingress-audit.test.ts src/app/api/v1/public/contact/route.test.ts src/app/api/v1/webhooks/stripe/route.test.ts src/app/api/v1/webhooks/twilio/route.test.ts src/app/api/v1/webhooks/whatsapp/route.test.ts
```

Expected: FAIL because direct buffering remains and chunked overflow is accepted.

- [ ] **Step 3: Replace direct buffering before parsing or signature verification**

Use explicit constants:

```ts
export const BODY_LIMITS = {
  publicJson: 64 * 1024,
  providerWebhook: 256 * 1024,
  publicMultipart: 12 * 1024 * 1024,
} as const;
```

For raw signed text:

```ts
let rawBody: string;
try {
  rawBody = decodeBoundedUtf8(await readBoundedBody(req, BODY_LIMITS.providerWebhook));
} catch (error) {
  if (error instanceof BodyTooLargeError)
    return NextResponse.json({ error: 'request too large', code: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
  return NextResponse.json({ error: 'invalid request', code: 'BAD_REQUEST' }, { status: 400 });
}
```

For JSON, parse only the bounded decoded string. For Tap, pass the bounded `Uint8Array` unchanged. For multipart, reconstruct a `Request` from the bounded bytes plus original method/headers and call `formData()` on that bounded copy. Preserve exact raw webhook bytes for signatures and hashes.

- [ ] **Step 4: Run the Step 2 command and all affected route tests**

Expected: PASS; 413 occurs before parsing, signature verification, or downstream callbacks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/http/bounded-ingress-audit.test.ts src/app/api/v1/public src/app/api/v1/webhooks
git commit -m "fix: bound public and webhook request bodies"
```

### Task 6: Add the atomic monotonic delivery-status RPC

**Files:**
- Create: `supabase/migrations/20261031010000_0126_launch_security_wave_1.sql`
- Create: `supabase/tests/launch_security_wave_1.sql`
- Create: `src/lib/data/launch-security-wave-1-migration.test.ts`
- Modify: `scripts/run-sql-integration.sh`

- [ ] **Step 1: Write RED static and transactional SQL tests**

The static test requires a `security definer set search_path = ''` function, row lock, provider/channel allowlist, explicit rank logic, terminal protection, redacted result, and grants only to `service_role`. The SQL fixture creates SMS and WhatsApp rows and proves applied, replayed, stale, terminal, unknown, not-found, timestamp preservation, concurrent serialization, and anon/authenticated denial.

- [ ] **Step 2: Run the static test and confirm RED**

```bash
node --import tsx --test src/lib/data/launch-security-wave-1-migration.test.ts
```

Expected: FAIL because migration 0125 does not exist.

- [ ] **Step 3: Implement the forward-only migration**

Create a service-only function with this public contract:

```sql
create or replace function public.apply_provider_delivery_status(
  p_channel text,
  p_provider text,
  p_provider_message_id text,
  p_provider_status text,
  p_provider_occurred_at timestamptz default null,
  p_safe_error_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = '';
```

Inside the function: validate bounded identifiers; map provider status to canonical status/rank; select the correct outbound row `for update`; return `not_found` without identifiers; return `unknown` for unmapped status; return `replayed` for equal state; return `stale` when rank regresses or any terminal state would change; otherwise update canonical status and only set timestamps with `coalesce(existing, provider time, clock_timestamp())`. For WhatsApp, allow `sent < delivered < read`; for SMS, allow `pending < sent < delivered`; treat failure/dead as terminal. Store only allowlisted error codes, never provider messages.

End with:

```sql
revoke all on function public.apply_provider_delivery_status(text,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.apply_provider_delivery_status(text,text,text,text,timestamptz,text) to service_role;
```

Add `launch_security_wave_1.sql` to the transactional `FIXTURES` array in `scripts/run-sql-integration.sh`.

- [ ] **Step 4: Run static and isolated SQL integration tests**

```bash
node --import tsx --test src/lib/data/launch-security-wave-1-migration.test.ts
npm run test:sql:integration
```

Expected: PASS; full migration chain plus Wave 1 fixture succeeds.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031010000_0126_launch_security_wave_1.sql supabase/tests/launch_security_wave_1.sql src/lib/data/launch-security-wave-1-migration.test.ts scripts/run-sql-integration.sh
git commit -m "fix: enforce monotonic provider delivery callbacks"
```

### Task 7: Route all verified delivery callbacks through the atomic RPC

**Files:**
- Create: `src/lib/events/provider-delivery-status.ts`
- Create: `src/lib/events/provider-delivery-status.test.ts`
- Modify: `src/app/api/v1/webhooks/twilio/route.ts`
- Modify: `src/app/api/v1/webhooks/unifonic/route.ts`
- Modify: `src/app/api/v1/webhooks/whatsapp/dispatch.ts`
- Modify relevant existing webhook tests.

- [ ] **Step 1: Write RED adapter and no-direct-update tests**

Test exact RPC arguments, timestamp parsing, error-code allowlisting, malformed RPC failure, and all redacted outcomes. Source assertions must reject `.from('outbound_sms').update` and `.from('outbound_whatsapp').update` in webhook handlers.

- [ ] **Step 2: Run focused callback tests and confirm RED**

```bash
node --import tsx --test src/lib/events/provider-delivery-status.test.ts src/app/api/v1/webhooks/twilio/route.test.ts src/app/api/v1/webhooks/whatsapp/dispatch.test.ts
```

Expected: FAIL because handlers still use select-then-update.

- [ ] **Step 3: Implement the typed RPC adapter**

```ts
export type DeliveryStatusOutcome = 'applied' | 'replayed' | 'stale' | 'unknown' | 'not_found';

export async function applyProviderDeliveryStatus(
  client: RpcClient,
  input: {
    channel: 'sms' | 'whatsapp';
    provider: 'twilio' | 'unifonic' | 'whatsapp';
    providerMessageId: string;
    providerStatus: string;
    providerOccurredAt?: string | null;
    safeErrorCode?: string | null;
  },
): Promise<DeliveryStatusOutcome> {
  const { data, error } = await client.rpc('apply_provider_delivery_status', {
    p_channel: input.channel,
    p_provider: input.provider,
    p_provider_message_id: input.providerMessageId,
    p_provider_status: input.providerStatus,
    p_provider_occurred_at: input.providerOccurredAt ?? null,
    p_safe_error_code: input.safeErrorCode ?? null,
  });
  if (error || !data || typeof data !== 'object') throw new Error('DELIVERY_STATUS_UNAVAILABLE');
  const outcome = (data as { outcome?: unknown }).outcome;
  if (!['applied', 'replayed', 'stale', 'unknown', 'not_found'].includes(String(outcome)))
    throw new Error('DELIVERY_STATUS_UNAVAILABLE');
  return outcome as DeliveryStatusOutcome;
}
```

Twilio and Unifonic pass channel `sms`; WhatsApp passes channel/provider `whatsapp`, its provider timestamp, and only a numeric/string allowlisted provider error code. Verified callback persistence failure returns 503 so the provider retries; stale/duplicate/unknown outcomes return 200 without mutation.

- [ ] **Step 4: Run focused callback tests and confirm GREEN**

Run the Step 2 command plus all webhook tests. Expected: PASS and no direct status update remains.

- [ ] **Step 5: Commit**

```bash
git add src/lib/events/provider-delivery-status.ts src/lib/events/provider-delivery-status.test.ts src/app/api/v1/webhooks/twilio src/app/api/v1/webhooks/unifonic src/app/api/v1/webhooks/whatsapp
git commit -m "fix: serialize delivery callback state"
```

### Task 8: Complete verification, independent review, and evidence reconciliation

**Files:**
- Modify outside repo: `Reports/launch-gate-evidence/2026-10-27/phase-3-public-dashboard-apis/p3-13-integration-acceptance/penetration-security-retest.md`
- Modify outside repo: `Reports/launch-gate-evidence/2026-10-27/phase-3-public-dashboard-apis/p3-13-integration-acceptance/remaining-blockers-or-final-acceptance.md`
- Modify outside repo: `Reports/daily-work-report.md`
- Modify outside repo: `docs/roadmap.md`

- [ ] **Step 1: Run focused security tests**

```bash
node --import tsx --test \
  src/lib/mail/sender.test.ts \
  src/lib/validation/tenant-settings.test.ts \
  src/lib/data/tenant-settings.test.ts \
  src/lib/rate-limit/sensitive.test.ts \
  src/lib/rate-limit/legacy-route-audit.test.ts \
  src/lib/http/bounded-body.test.ts \
  src/lib/http/bounded-ingress-audit.test.ts \
  src/lib/data/launch-security-wave-1-migration.test.ts \
  src/lib/events/provider-delivery-status.test.ts
```

Expected: all pass, zero skipped security assertions.

- [ ] **Step 2: Run database and complete source verification**

```bash
npm run test:sql:integration
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run format:check
git diff --check
npm run build
netlify build --context deploy-preview
```

Expected: every command exits 0; only already documented non-fatal build warnings remain.

- [ ] **Step 3: Request independent security review of the exact immutable diff**

Review range: production merge `109ea9dfa33aa60fa6aeb6404e80f835641068aa..HEAD`. Require explicit verdicts for SSRF reachability, fail-open bypass, chunked/multibyte overflow, callback replay/order/concurrency, privilege grants, secret logging, and regression risk. Fix any validated finding with a new RED test and rerun all gates.

- [ ] **Step 4: Reconcile evidence without overstating external gates**

Record exact commit, test totals, SQL fixture result, review verdict, and remaining launch blockers. Mark only the four Medium code findings remediated/retested. Keep provider credentials, formal external penetration testing, runtime cutover/receipts, performance, destructive privacy, four-role axe, and legal/provider approvals open.

- [ ] **Step 5: Confirm final branch integrity**

```bash
git status --short
git log --oneline 109ea9dfa33aa60fa6aeb6404e80f835641068aa..HEAD
```

Expected: the worktree is clean and every Wave 1 implementation commit is listed after the deployed baseline. Do not push, merge, deploy, mutate environment values, invoke providers, or run destructive erasure without separate authorization.
