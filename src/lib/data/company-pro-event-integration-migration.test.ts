import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const path = 'supabase/migrations/20260921030000_0105_company_pro_event_integration.sql';

test('P3.03 registers exact v1 reference-only event schemas and one internal consumer', () => {
  const sql = readFileSync(path, 'utf8');
  const registrations = sql.slice(
    sql.indexOf('insert into public.event_contract_registrations'),
    sql.indexOf('insert into public.event_consumer_registrations'),
  );
  for (const eventType of [
    'company.onboarding.section_saved',
    'company.onboarding.submitted',
    'company.onboarding.activated',
    'company.settings.updated',
    'pro.credential.submitted',
    'pro.credential.decided',
    'pro.credential.evidence_changed',
    'pro.commercial_terms.changed',
  ]) {
    assert.match(sql, new RegExp(eventType.replaceAll('.', '\\.'), 'u'));
  }
  assert.match(sql, /insert into public\.event_contract_registrations/u);
  assert.match(sql, /insert into public\.event_consumer_registrations/u);
  assert.doesNotMatch(registrations, /recipient|email|phone|message|token|storage_path/iu);
});

test('P3.03 emits only through the frozen transaction-local publisher', () => {
  const sql = readFileSync(path, 'utf8');
  assert.match(sql, /public\.publish_domain_event\(/u);
  assert.match(sql, /after insert on public\.tenant_audit_log/u);
  assert.match(sql, /after insert on public\.pro_credential_decisions/u);
  assert.match(sql, /after insert or delete on public\.pro_credential_evidence/u);
  assert.match(sql, /after insert on public\.pro_commercial_term_events/u);
  assert.doesNotMatch(sql, /insert into public\.(domain_events|event_jobs)/u);
});

test('event trigger functions are fixed-path, non-client and stable-dedupe aware', () => {
  const sql = readFileSync(path, 'utf8');
  assert.match(sql, /security definer\s+set search_path = ''/u);
  assert.match(sql, /pg_catalog\.encode\(pg_catalog\.sha256/u);
  assert.match(sql, /revoke all on function .* from public, anon, authenticated, service_role/iu);
  assert.match(sql, /coalesce\(.*operation_id/u);
  assert.match(
    sql,
    /p_event_type\s*\|\|\s*':1:'\s*\|\|\s*p_source/u,
    'event identity must include the fully scoped producer source',
  );
  assert.match(
    sql,
    /new\.tenant_id::text[\s\S]*v_company_id::text[\s\S]*v_operation_id::text[\s\S]*version/u,
    'company event identity must include tenant, company, operation, and committed version',
  );
});

test('PRO event contracts and identities retain the causal operation id', () => {
  const sql = readFileSync(path, 'utf8');
  for (const eventType of [
    'pro.credential.submitted',
    'pro.credential.decided',
    'pro.credential.evidence_changed',
    'pro.commercial_terms.changed',
  ]) {
    const line = sql.split('\n').find((candidate) => candidate.includes(`('${eventType}',`));
    assert.ok(
      line?.includes('"operation_id":"uuid"'),
      `${eventType} schema must require operation_id`,
    );
  }
  assert.match(sql, /'operation_id'\s*,\s*v_operation_id/u);
  assert.match(sql, /p_correlation_id[\s\S]*v_operation_id/u);
  assert.match(
    sql,
    /coalesce\(removal\.recovery_operation_id,\s*removal\.operation_id\)/u,
    'recovered evidence removal must use the recovery request as its causal operation',
  );
  assert.match(
    sql,
    /resource[^;]+operation[^;]+version/iu,
    'PRO dedupe source must bind resource, operation, and committed version',
  );
});
