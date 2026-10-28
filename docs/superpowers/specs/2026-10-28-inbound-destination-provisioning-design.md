# Inbound Destination Provisioning Design

## Goal

Restore a safe provisioning and re-key path for inbound destinations retired by migration 0118 without storing plaintext destinations, enabling a provider, or calling a provider.

## Contract

A forward-only migration adds a fixed-search-path security-definer RPC callable only by `service_role`. The RPC accepts a precomputed `v1:` HMAC, provider, tenant/company ownership, operation and correlation identifiers, plus an explicit readiness flag. It validates the provider/hash and ownership chain, defaults new and re-keyed destinations to disabled, rejects enabled provisioning unless readiness is explicitly true, prevents a hash from moving between owners, and writes an immutable platform audit event in the same transaction. Replaying an operation returns the original destination without another mutation or audit row.

A server-only TypeScript helper computes the HMAC using `INBOUND_DESTINATION_HMAC_SECRET`, validates identifiers, defaults `enabled` and readiness to false, and calls only the RPC. It imports no provider SDK and performs no provider network request.

## Rollout

Apply the migration and generated types first. Configure the same 32-or-more-character HMAC secret on every callback and provisioning runtime. Provision or re-key each destination disabled, verify ownership and audit evidence, and leave channels disabled during reduced P3.13 acceptance. Enabling requires a separate, explicit readiness-approved invocation after provider configuration and callback validation.

## Verification

Static migration tests and a disposable-database SQL fixture cover grants, validation, ownership, audit atomicity, idempotency, disabled defaults, and readiness gating. Unit tests cover deterministic HMAC computation, missing-secret failure, disabled RPC arguments, explicit enable gating, sanitized errors, and absence of provider calls.
