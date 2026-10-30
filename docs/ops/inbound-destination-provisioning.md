# Inbound destination provisioning

This procedure provisions or re-keys an opaque inbound destination. It does not configure a
provider, call a provider API, or enable a channel automatically.

## Deploy order

- [ ] Apply migrations `20261027090000_0121_inbound_destination_provisioning.sql` and
      `20261027100000_0122_inbound_destination_stable_replay.sql`, in that order, in an approved
      non-production environment and run the SQL integration fixture.
- [ ] Regenerate and review `src/lib/db/database.types.ts` from that migrated schema. Do not hand
      edit the generated RPC contract.
- [ ] Deploy the reviewed migration, generated types, and server helper before invoking the RPC.
- [ ] Configure the same `INBOUND_DESTINATION_HMAC_SECRET` (at least 32 characters) in every
      callback and provisioning runtime. Use the secret manager; never print the value.
- [ ] Provision or re-key with `enabled: false` and `readinessApproved: false` through
      `provisionInboundDestination`. Supply the plaintext destination only inside that trusted
      server process; never place it in shell arguments, logs, audit metadata, or tickets.
- [ ] Verify the destination owner and one matching immutable audit event using only destination,
      tenant, company, operation, and correlation UUIDs. Do not select `destination_key_hash`.
- [ ] During reduced P3.13 acceptance, leave the destination disabled.
- [ ] Only after provider configuration and a signed callback validation are independently
      complete, use a new operation UUID and make a separate invocation with `enabled: true` and
      `readinessApproved: true`.

## Checks

Run these repository checks before release; none prints a destination or secret:

```bash
node --import tsx --conditions=react-server --test \
  src/lib/events/inbound-destination-provisioning.test.ts \
  src/lib/data/inbound-webhook-atomic-migration.test.ts
npx tsc --noEmit
npx eslint src/lib/events/inbound-destination-provisioning.ts \
  src/lib/events/inbound-destination-provisioning.test.ts
npx prettier --check \
  src/lib/events/inbound-destination-provisioning.ts \
  src/lib/events/inbound-destination-provisioning.test.ts \
  supabase/migrations/20261027090000_0121_inbound_destination_provisioning.sql \
  docs/ops/inbound-destination-provisioning.md
git diff --check
```

After a disabled invocation, query by non-secret identifiers only:

```sql
select id, provider, tenant_id, company_id, enabled, updated_at
from public.inbound_destinations
where id = :'destination_id'::uuid;

select event_name, tenant_id, action, target_opaque_id, outcome, reason_code,
       operation_id, correlation_id, created_at
from public.platform_audit_events
where event_name = 'integration.inbound_destination_provisioned'
  and operation_id = :'operation_id'::uuid;

-- Database-owner verification only; the application service role has no table access.
select operation_id, destination_id, enabled, created_at
from public.inbound_destination_provisioning_receipts
where operation_id = :'operation_id'::uuid;
```

Expected before readiness approval: exactly one destination row with the intended active owner and
`enabled = false`, plus exactly one successful audit row whose `target_opaque_id` is that destination
UUID, plus exactly one immutable replay receipt. Replaying the same request and operation UUID must
return the original destination ID and enabled result with `replayed = true`, even after a later
valid operation re-keys that destination. Replay must not add or mutate a receipt or audit row.

## Failure handling

Treat `INBOUND_DESTINATION_PROVISIONING_FAILED` as fail-closed. Keep the destination disabled and
inspect server-side structured diagnostics without adding plaintext destinations, HMAC values,
database messages, or secret values. Correct ownership/readiness inputs and retry with the same
operation UUID only when the request is identical; otherwise use a new operation UUID.
