-- P3.05 authoritative estimator/questionnaire/contact/application/lead integration.
-- P3.04 owns catalog data, P3.07 owns storage primitives, and P3.10 owns the event interface.
begin;

create table public.questionnaire_definitions (
  id uuid primary key default gen_random_uuid(),
  definition_key text not null unique check (definition_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  title text not null check (char_length(title) between 1 and 200),
  current_draft_version integer not null default 0 check (current_draft_version >= 0),
  current_published_version integer check (current_published_version > 0),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questionnaire_definition_versions (
  definition_id uuid not null references public.questionnaire_definitions(id) on delete restrict,
  version integer not null check (version > 0),
  state text not null check (state in ('draft', 'published', 'archived')),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  definition_hash text not null check (definition_hash ~ '^[a-f0-9]{64}$'),
  row_version bigint not null default 1 check (row_version > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (definition_id, version),
  constraint questionnaire_version_state_time check (
    (state = 'draft' and published_at is null and archived_at is null)
    or (state = 'published' and published_at is not null and archived_at is null)
    or (state = 'archived' and published_at is not null and archived_at is not null)
  )
);

create unique index questionnaire_one_published_version_idx
  on public.questionnaire_definition_versions(definition_id)
  where state = 'published';

create table public.public_contact_intakes (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  normalized_payload jsonb not null check (jsonb_typeof(normalized_payload) = 'object'),
  consent_version text not null check (char_length(consent_version) between 1 and 80),
  consent_accepted_at timestamptz not null,
  abuse_scope_hash text not null check (abuse_scope_hash ~ '^[a-f0-9]{64}$'),
  acknowledgement_state text not null default 'pending'
    check (acknowledgement_state in ('pending', 'suppressed', 'unavailable', 'delivered')),
  accepted_at timestamptz not null default now()
);

create table public.public_application_drafts (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null,
  definition_version integer not null,
  resume_secret_hash text not null check (resume_secret_hash ~ '^[a-f0-9]{64}$'),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  estimator_result_id uuid,
  state text not null default 'draft' check (state in ('draft', 'submitted', 'expired', 'deleted')),
  row_version bigint not null default 1 check (row_version > 0),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (definition_id, definition_version)
    references public.questionnaire_definition_versions(definition_id, version) on delete restrict
);

create index public_application_drafts_expiry_idx
  on public.public_application_drafts(expires_at, id) where state = 'draft';

create table public.public_applications (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references public.public_application_drafts(id) on delete restrict,
  lead_id uuid not null unique references public.leads(id) on delete restrict,
  definition_id uuid not null,
  definition_version integer not null,
  accepted_operation_id uuid not null unique,
  accepted_at timestamptz not null default now(),
  retention_until timestamptz not null,
  foreign key (definition_id, definition_version)
    references public.questionnaire_definition_versions(definition_id, version) on delete restrict
);

create table public.public_application_attachments (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.public_application_drafts(id) on delete restrict,
  application_id uuid references public.public_applications(id) on delete restrict,
  field_id text not null check (field_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  document_upload_id uuid,
  storage_path text check (storage_path ~ '^public-intake/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|docx|xlsx)$'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  scan_state text not null check (scan_state in ('reserved', 'clean', 'rejected', 'expired', 'deleted')),
  immutable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (draft_id, field_id, content_sha256)
);

create table public.public_intake_operations (
  scope text not null check (scope in ('contact', 'draft_create', 'draft_save', 'application_submit', 'lead_mutation', 'attachment_reserve')),
  subject_id uuid,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  sanitized_result jsonb not null check (jsonb_typeof(sanitized_result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (scope, operation_id)
);

alter table public.leads
  add column if not exists row_version bigint not null default 1 check (row_version > 0),
  add column if not exists lead_score_version integer not null default 1 check (lead_score_version > 0),
  add column if not exists lead_score_factors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lead_score_factors) = 'array'),
  add column if not exists intake_operation_id uuid,
  add column if not exists consent_provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(consent_provenance) = 'object');

create unique index if not exists leads_intake_operation_unique
  on public.leads(intake_operation_id) where intake_operation_id is not null;
create index if not exists leads_platform_kanban_order_idx
  on public.leads(stage, score desc, created_at desc, id desc);

alter table public.questionnaire_definitions enable row level security;
alter table public.questionnaire_definition_versions enable row level security;
alter table public.public_contact_intakes enable row level security;
alter table public.public_application_drafts enable row level security;
alter table public.public_applications enable row level security;
alter table public.public_application_attachments enable row level security;
alter table public.public_intake_operations enable row level security;

create policy questionnaire_published_public_read
  on public.questionnaire_definition_versions for select to anon, authenticated
  using (state = 'published');
-- Admin reads go through the service-role data layer with fresh role/status/AAL2 checks,
-- never a cached-JWT RLS policy. Only the published-version public read is exposed here.

revoke all on public.questionnaire_definitions from anon, authenticated;
revoke all on public.questionnaire_definition_versions from anon, authenticated;
grant select on public.questionnaire_definitions to authenticated;
grant select on public.questionnaire_definition_versions to anon, authenticated;
revoke all on public.public_contact_intakes from anon, authenticated;
revoke all on public.public_application_drafts from anon, authenticated;
revoke all on public.public_applications from anon, authenticated;
revoke all on public.public_application_attachments from anon, authenticated;
revoke all on public.public_intake_operations from anon, authenticated;

insert into public.event_contract_registrations(event_type, event_version, payload_schema)
values
  ('contact.accepted', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer"}'),
  ('application.draft_submitted', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer"}'),
  ('application.accepted', 1, '{"resource_id":"uuid","lead_id":"uuid","operation_id":"uuid","version":"integer"}'),
  ('lead.assigned', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer"}'),
  ('lead.stage_changed', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}'),
  ('lead.note_added', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer"}');

insert into public.event_consumer_registrations(
  consumer_name, event_type, event_version, max_attempts, default_lease_seconds, enabled
)
select 'internal.p305.projection', event_type, event_version, 5, 120, true
from public.event_contract_registrations
where event_type in (
  'contact.accepted', 'application.draft_submitted', 'application.accepted',
  'lead.assigned', 'lead.stage_changed', 'lead.note_added'
);

create function private.p305_uuid(p_seed text)
returns uuid language sql immutable security definer set search_path = ''
as $$
  select (
    substr(encode(sha256(convert_to(p_seed, 'UTF8')), 'hex'), 1, 8) || '-' ||
    substr(encode(sha256(convert_to(p_seed, 'UTF8')), 'hex'), 9, 4) || '-4' ||
    substr(encode(sha256(convert_to(p_seed, 'UTF8')), 'hex'), 14, 3) || '-a' ||
    substr(encode(sha256(convert_to(p_seed, 'UTF8')), 'hex'), 18, 3) || '-' ||
    substr(encode(sha256(convert_to(p_seed, 'UTF8')), 'hex'), 21, 12)
  )::uuid
$$;

create function private.publish_p305_event(
  p_event_type text,
  p_resource_id uuid,
  p_operation_id uuid,
  p_version bigint,
  p_extra jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_seed text := p_event_type || ':1:' || p_resource_id::text || ':' || p_operation_id::text;
begin
  perform public.publish_domain_event(
    private.p305_uuid(v_seed), p_event_type, 1::smallint, now(), null, null, null,
    p_operation_id, null, 'restricted',
    jsonb_build_object(
      'resource_id', p_resource_id,
      'operation_id', p_operation_id,
      'version', p_version
    ) || p_extra,
    encode(sha256(convert_to(v_seed, 'UTF8')), 'hex')
  );
end;
$$;

create function private.p305_replay(
  p_scope text, p_operation_id uuid, p_request_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_receipt public.public_intake_operations%rowtype;
begin
  if p_operation_id is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_OPERATION';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_operation_id::text, 0));
  select * into v_receipt from public.public_intake_operations
    where scope = p_scope and operation_id = p_operation_id for update;
  if not found then return null; end if;
  if v_receipt.request_hash <> p_request_hash then
    raise exception using errcode = '23505', message = 'OPERATION_REUSED';
  end if;
  return v_receipt.sanitized_result;
end;
$$;

create function public.accept_public_contact(
  p_operation_id uuid,
  p_request_hash text,
  p_normalized_payload jsonb,
  p_consent_version text,
  p_consent_accepted_at timestamptz,
  p_abuse_scope_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_id uuid := gen_random_uuid(); v_result jsonb;
begin
  v_replay := private.p305_replay('contact', p_operation_id, p_request_hash);
  if v_replay is not null then return v_replay; end if;
  if jsonb_typeof(p_normalized_payload) <> 'object'
    or p_consent_accepted_at > now() + interval '5 minutes'
    or p_consent_accepted_at < now() - interval '30 minutes'
    or p_abuse_scope_hash !~ '^[a-f0-9]{64}$'
  then raise exception using errcode = '22023', message = 'INVALID_CONTACT'; end if;
  insert into public.public_contact_intakes(
    id, operation_id, request_hash, normalized_payload, consent_version,
    consent_accepted_at, abuse_scope_hash
  ) values (
    v_id, p_operation_id, p_request_hash, p_normalized_payload, p_consent_version,
    p_consent_accepted_at, p_abuse_scope_hash
  );
  v_result := jsonb_build_object('contactId', v_id, 'accepted', true, 'deliveryState', 'pending');
  insert into public.public_intake_operations(scope, subject_id, operation_id, request_hash, sanitized_result)
    values ('contact', v_id, p_operation_id, p_request_hash, v_result);
  perform private.publish_p305_event('contact.accepted', v_id, p_operation_id, 1);
  return v_result;
end;
$$;

create function public.create_public_application_draft(
  p_operation_id uuid,
  p_request_hash text,
  p_definition_id uuid,
  p_definition_version integer,
  p_resume_secret_hash text,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_id uuid := gen_random_uuid(); v_result jsonb;
begin
  v_replay := private.p305_replay('draft_create', p_operation_id, p_request_hash);
  if v_replay is not null then return v_replay; end if;
  if p_resume_secret_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at <= now() or p_expires_at > now() + interval '30 days'
    or not exists (
      select 1 from public.questionnaire_definition_versions
      where definition_id = p_definition_id and version = p_definition_version and state = 'published'
    )
  then raise exception using errcode = '22023', message = 'INVALID_DRAFT'; end if;
  insert into public.public_application_drafts(
    id, definition_id, definition_version, resume_secret_hash, expires_at
  ) values (v_id, p_definition_id, p_definition_version, p_resume_secret_hash, p_expires_at);
  v_result := jsonb_build_object('draftId', v_id, 'version', 1, 'expiresAt', p_expires_at);
  insert into public.public_intake_operations(scope, subject_id, operation_id, request_hash, sanitized_result)
    values ('draft_create', v_id, p_operation_id, p_request_hash, v_result);
  return v_result;
end;
$$;

create function public.save_public_application_draft(
  p_draft_id uuid,
  p_resume_secret_hash text,
  p_operation_id uuid,
  p_request_hash text,
  p_expected_version bigint,
  p_answers jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_draft public.public_application_drafts%rowtype; v_result jsonb;
begin
  v_replay := private.p305_replay('draft_save', p_operation_id, p_request_hash);
  if v_replay is not null then return v_replay; end if;
  select * into v_draft from public.public_application_drafts where id = p_draft_id for update;
  if not found or v_draft.resume_secret_hash <> p_resume_secret_hash
    or v_draft.state <> 'draft' or v_draft.expires_at <= now()
  then raise exception using errcode = 'P0001', message = 'DRAFT_UNAVAILABLE'; end if;
  if v_draft.row_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'STALE_DRAFT_VERSION'; end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_ANSWERS'; end if;
  update public.public_application_drafts set
    answers = p_answers, row_version = row_version + 1, updated_at = now()
    where id = p_draft_id returning * into v_draft;
  v_result := jsonb_build_object('draftId', p_draft_id, 'version', v_draft.row_version, 'saved', true);
  insert into public.public_intake_operations(scope, subject_id, operation_id, request_hash, sanitized_result)
    values ('draft_save', p_draft_id, p_operation_id, p_request_hash, v_result);
  return v_result;
end;
$$;

create function public.submit_public_application(
  p_draft_id uuid,
  p_resume_secret_hash text,
  p_operation_id uuid,
  p_request_hash text,
  p_expected_version bigint,
  p_score integer,
  p_score_version integer,
  p_score_factors jsonb,
  p_consent_provenance jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_draft public.public_application_drafts%rowtype;
  v_lead_id uuid := gen_random_uuid(); v_application_id uuid := gen_random_uuid(); v_result jsonb;
begin
  v_replay := private.p305_replay('application_submit', p_operation_id, p_request_hash);
  if v_replay is not null then return v_replay; end if;
  select * into v_draft from public.public_application_drafts where id = p_draft_id for update;
  if not found or v_draft.resume_secret_hash <> p_resume_secret_hash
    or v_draft.state <> 'draft' or v_draft.expires_at <= now()
  then raise exception using errcode = 'P0001', message = 'DRAFT_UNAVAILABLE'; end if;
  if v_draft.row_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'STALE_DRAFT_VERSION'; end if;
  if p_score not between 0 and 100 or p_score_version < 1
    or jsonb_typeof(p_score_factors) <> 'array' or jsonb_typeof(p_consent_provenance) <> 'object'
  then raise exception using errcode = '22023', message = 'INVALID_SUBMISSION'; end if;
  if exists (
    select 1 from public.public_application_attachments
    where draft_id = p_draft_id
      and scan_state not in ('deleted', 'expired')
      and (scan_state <> 'clean' or not immutable)
  ) then raise exception using errcode = 'P0001', message = 'ATTACHMENT_NOT_READY'; end if;

  insert into public.leads(
    id, tenant_id, name, email, phone, source, stage, form_data, estimate_data,
    routing_reason, score, lead_score_version, lead_score_factors,
    intake_operation_id, consent_provenance
  ) values (
    v_lead_id, null, coalesce(v_draft.answers->>'fullName', 'Applicant'),
    nullif(v_draft.answers->>'email', ''), nullif(v_draft.answers->>'phone', ''),
    'questionnaire', 'new', v_draft.answers, '{}'::jsonb, 'platform_unassigned',
    p_score, p_score_version, p_score_factors, p_operation_id, p_consent_provenance
  );
  insert into public.public_applications(
    id, draft_id, lead_id, definition_id, definition_version,
    accepted_operation_id, retention_until
  ) values (
    v_application_id, p_draft_id, v_lead_id, v_draft.definition_id,
    v_draft.definition_version, p_operation_id, now() + interval '7 years'
  );
  update public.public_application_attachments set
    application_id = v_application_id where draft_id = p_draft_id;
  update public.public_application_drafts set
    state = 'submitted', submitted_at = now(), row_version = row_version + 1, updated_at = now()
    where id = p_draft_id;
  v_result := jsonb_build_object(
    'applicationId', v_application_id, 'leadId', v_lead_id,
    'accepted', true, 'deliveryState', 'pending'
  );
  insert into public.public_intake_operations(scope, subject_id, operation_id, request_hash, sanitized_result)
    values ('application_submit', v_application_id, p_operation_id, p_request_hash, v_result);
  perform private.publish_p305_event(
    'application.draft_submitted', p_draft_id, p_operation_id, p_expected_version + 1
  );
  perform private.publish_p305_event(
    'application.accepted', v_application_id, p_operation_id, 1,
    jsonb_build_object('lead_id', v_lead_id)
  );
  return v_result;
end;
$$;

create function public.mutate_platform_lead(
  p_lead_id uuid,
  p_operation_id uuid,
  p_request_hash text,
  p_expected_version bigint,
  p_action text,
  p_value text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_lead public.leads%rowtype; v_actor public.profiles%rowtype;
  v_event_type text; v_result jsonb; v_tenant uuid;
begin
  select * into v_actor from public.profiles where id = auth.uid() for update;
  if not found or v_actor.status <> 'active' or v_actor.role not in ('admin', 'super_admin')
    or coalesce(auth.jwt()->>'aal', '') <> 'aal2'
  then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  v_replay := private.p305_replay('lead_mutation', p_operation_id, p_request_hash);
  if v_replay is not null then return v_replay; end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'LEAD_NOT_FOUND'; end if;
  if v_lead.row_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'STALE_LEAD_VERSION'; end if;

  if p_action = 'assign' then
    v_tenant := p_value::uuid;
    if not exists (select 1 from public.tenants where id = v_tenant and status = 'active') then
      raise exception using errcode = '22023', message = 'INVALID_ASSIGNEE'; end if;
    update public.leads set tenant_id = v_tenant, routing_reason = 'assigned_by_platform',
      row_version = row_version + 1 where id = p_lead_id;
    v_event_type := 'lead.assigned';
  elsif p_action = 'stage' and p_value in ('new', 'contacted', 'qualified', 'won', 'lost') then
    update public.leads set stage = p_value, row_version = row_version + 1 where id = p_lead_id;
    v_event_type := 'lead.stage_changed';
  elsif p_action = 'note' and char_length(btrim(p_value)) between 1 and 2000 then
    update public.leads set row_version = row_version + 1 where id = p_lead_id;
    v_event_type := 'lead.note_added';
  else raise exception using errcode = '22023', message = 'INVALID_LEAD_MUTATION'; end if;

  insert into public.lead_events(lead_id, tenant_id, actor_id, event_type, to_value, note)
  values (
    p_lead_id, coalesce(v_tenant, v_lead.tenant_id), v_actor.id,
    replace(v_event_type, '.', '_'),
    case when p_action in ('assign', 'stage') then p_value end,
    case when p_action = 'note' then btrim(p_value) end
  );
  v_result := jsonb_build_object('leadId', p_lead_id, 'version', p_expected_version + 1, 'accepted', true);
  insert into public.public_intake_operations(scope, subject_id, operation_id, request_hash, sanitized_result)
    values ('lead_mutation', p_lead_id, p_operation_id, p_request_hash, v_result);
  perform private.publish_p305_event(
    v_event_type, p_lead_id, p_operation_id, p_expected_version + 1,
    case when p_action = 'stage' then jsonb_build_object('state', p_value) else '{}'::jsonb end
  );
  return v_result;
end;
$$;

revoke all on function public.accept_public_contact(uuid,text,jsonb,text,timestamptz,text) from public;
revoke all on function public.create_public_application_draft(uuid,text,uuid,integer,text,timestamptz) from public;
revoke all on function public.save_public_application_draft(uuid,text,uuid,text,bigint,jsonb) from public;
revoke all on function public.submit_public_application(uuid,text,uuid,text,bigint,integer,integer,jsonb,jsonb) from public;
revoke all on function public.mutate_platform_lead(uuid,uuid,text,bigint,text,text) from public, anon;
grant execute on function public.accept_public_contact(uuid,text,jsonb,text,timestamptz,text) to anon, service_role;
grant execute on function public.create_public_application_draft(uuid,text,uuid,integer,text,timestamptz) to anon, service_role;
grant execute on function public.save_public_application_draft(uuid,text,uuid,text,bigint,jsonb) to anon, service_role;
grant execute on function public.submit_public_application(uuid,text,uuid,text,bigint,integer,integer,jsonb,jsonb) to anon, service_role;
grant execute on function public.mutate_platform_lead(uuid,uuid,text,bigint,text,text) to authenticated, service_role;

-- P3.05 anonymous attachment lifecycle. Authorization is the hashed resume credential
-- bound to the owning draft/field, never a bare attachment or draft UUID. Storage bytes
-- live in the private document bucket under an isolated public-intake/ prefix.
create function private.p305_draft_for_write(
  p_draft_id uuid, p_resume_secret_hash text
) returns public.public_application_drafts language plpgsql security definer set search_path = '' as $$
declare v_draft public.public_application_drafts%rowtype;
begin
  select * into v_draft from public.public_application_drafts where id = p_draft_id for update;
  if not found or v_draft.resume_secret_hash <> p_resume_secret_hash
    or v_draft.state <> 'draft' or v_draft.expires_at <= now()
  then raise exception using errcode = 'P0001', message = 'DRAFT_UNAVAILABLE'; end if;
  return v_draft;
end;
$$;

create function public.reserve_public_application_attachment(
  p_draft_id uuid,
  p_resume_secret_hash text,
  p_operation_id uuid,
  p_request_hash text,
  p_field_id text,
  p_content_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_id uuid := gen_random_uuid(); v_result jsonb;
begin
  v_replay := private.p305_replay('attachment_reserve', p_operation_id, p_request_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p305_draft_for_write(p_draft_id, p_resume_secret_hash);
  if p_field_id !~ '^[a-z][a-z0-9_]{1,63}$' or p_content_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_ATTACHMENT'; end if;
  begin
    insert into public.public_application_attachments(
      id, draft_id, field_id, content_sha256, scan_state
    ) values (v_id, p_draft_id, p_field_id, p_content_sha256, 'reserved');
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'ATTACHMENT_DUPLICATE';
  end;
  v_result := jsonb_build_object('attachmentId', v_id, 'scanState', 'reserved');
  insert into public.public_intake_operations(scope, subject_id, operation_id, request_hash, sanitized_result)
    values ('attachment_reserve', v_id, p_operation_id, p_request_hash, v_result);
  return v_result;
end;
$$;

create function public.finalize_public_application_attachment(
  p_attachment_id uuid,
  p_draft_id uuid,
  p_resume_secret_hash text,
  p_storage_path text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.public_application_attachments%rowtype;
begin
  perform private.p305_draft_for_write(p_draft_id, p_resume_secret_hash);
  select * into v_row from public.public_application_attachments
    where id = p_attachment_id and draft_id = p_draft_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ATTACHMENT_NOT_FOUND'; end if;
  -- Idempotent: an already-finalized row with the same path is a safe replay.
  if v_row.scan_state = 'clean' and v_row.immutable and v_row.storage_path = p_storage_path then
    return jsonb_build_object('attachmentId', p_attachment_id, 'scanState', 'clean');
  end if;
  if v_row.scan_state <> 'reserved' then
    raise exception using errcode = 'P0001', message = 'ATTACHMENT_NOT_RESERVED'; end if;
  update public.public_application_attachments
    set scan_state = 'clean', immutable = true, storage_path = p_storage_path
    where id = p_attachment_id;
  return jsonb_build_object('attachmentId', p_attachment_id, 'scanState', 'clean');
end;
$$;

create function public.delete_public_application_attachment(
  p_attachment_id uuid,
  p_draft_id uuid,
  p_resume_secret_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.public_application_attachments%rowtype;
begin
  perform private.p305_draft_for_write(p_draft_id, p_resume_secret_hash);
  select * into v_row from public.public_application_attachments
    where id = p_attachment_id and draft_id = p_draft_id for update;
  if not found or v_row.scan_state in ('deleted', 'expired') then
    return jsonb_build_object('attachmentId', p_attachment_id, 'deleted', true, 'storagePath', null);
  end if;
  update public.public_application_attachments set scan_state = 'deleted' where id = p_attachment_id;
  return jsonb_build_object(
    'attachmentId', p_attachment_id, 'deleted', true, 'storagePath', v_row.storage_path
  );
end;
$$;

revoke all on function public.reserve_public_application_attachment(uuid,text,uuid,text,text,text) from public;
revoke all on function public.finalize_public_application_attachment(uuid,uuid,text,text) from public;
revoke all on function public.delete_public_application_attachment(uuid,uuid,text) from public;
grant execute on function public.reserve_public_application_attachment(uuid,text,uuid,text,text,text) to anon, service_role;
grant execute on function public.finalize_public_application_attachment(uuid,uuid,text,text) to anon, service_role;
grant execute on function public.delete_public_application_attachment(uuid,uuid,text) to anon, service_role;

-- Admin questionnaire definition workflow. AAL2 platform operators only, optimistic
-- concurrency on the definition row, and published versions are never re-written (only a
-- new draft version may be created), so bound public drafts keep an immutable definition.
create function private.p305_require_admin_aal2()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles%rowtype;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not found or v_actor.status <> 'active' or v_actor.role not in ('admin', 'super_admin')
    or coalesce(auth.jwt()->>'aal', '') <> 'aal2'
  then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  return v_actor.id;
end;
$$;

create function public.save_questionnaire_draft(
  p_definition_key text,
  p_title text,
  p_expected_definition_version bigint,
  p_definition jsonb,
  p_definition_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_def public.questionnaire_definitions%rowtype; v_version integer; v_has_draft boolean;
begin
  v_actor := private.p305_require_admin_aal2();
  if p_definition_key !~ '^[a-z][a-z0-9-]{1,63}$' or char_length(p_title) not between 1 and 200
    or jsonb_typeof(p_definition) <> 'object' or p_definition_hash !~ '^[a-f0-9]{64}$'
  then raise exception using errcode = '22023', message = 'INVALID_DEFINITION'; end if;

  select * into v_def from public.questionnaire_definitions where definition_key = p_definition_key for update;
  if not found then
    if p_expected_definition_version <> 0 then
      raise exception using errcode = '40001', message = 'STALE_DEFINITION_VERSION'; end if;
    insert into public.questionnaire_definitions(definition_key, title, current_draft_version, row_version)
      values (p_definition_key, p_title, 1, 1) returning * into v_def;
    v_version := 1;
    insert into public.questionnaire_definition_versions(
      definition_id, version, state, definition, definition_hash, created_by
    ) values (v_def.id, 1, 'draft', p_definition, p_definition_hash, v_actor);
    return jsonb_build_object('definitionId', v_def.id, 'version', v_version, 'rowVersion', v_def.row_version);
  end if;

  if v_def.row_version <> p_expected_definition_version then
    raise exception using errcode = '40001', message = 'STALE_DEFINITION_VERSION'; end if;
  v_has_draft := v_def.current_draft_version > 0 and exists (
    select 1 from public.questionnaire_definition_versions
    where definition_id = v_def.id and version = v_def.current_draft_version and state = 'draft'
  );
  if v_has_draft then
    v_version := v_def.current_draft_version;
    update public.questionnaire_definition_versions
      set definition = p_definition, definition_hash = p_definition_hash,
          row_version = row_version + 1, updated_at = now()
      where definition_id = v_def.id and version = v_version;
  else
    v_version := greatest(v_def.current_draft_version, coalesce(v_def.current_published_version, 0)) + 1;
    insert into public.questionnaire_definition_versions(
      definition_id, version, state, definition, definition_hash, created_by
    ) values (v_def.id, v_version, 'draft', p_definition, p_definition_hash, v_actor);
  end if;
  update public.questionnaire_definitions
    set title = p_title, current_draft_version = v_version, row_version = row_version + 1, updated_at = now()
    where id = v_def.id returning * into v_def;
  return jsonb_build_object('definitionId', v_def.id, 'version', v_version, 'rowVersion', v_def.row_version);
end;
$$;

create function public.publish_questionnaire_version(
  p_definition_id uuid,
  p_version integer,
  p_expected_definition_version bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_def public.questionnaire_definitions%rowtype; v_state text;
begin
  perform private.p305_require_admin_aal2();
  select * into v_def from public.questionnaire_definitions where id = p_definition_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'DEFINITION_NOT_FOUND'; end if;
  if v_def.row_version <> p_expected_definition_version then
    raise exception using errcode = '40001', message = 'STALE_DEFINITION_VERSION'; end if;
  select state into v_state from public.questionnaire_definition_versions
    where definition_id = p_definition_id and version = p_version for update;
  if v_state is null or v_state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'VERSION_NOT_PUBLISHABLE'; end if;
  update public.questionnaire_definition_versions
    set state = 'archived', archived_at = now(), updated_at = now()
    where definition_id = p_definition_id and state = 'published';
  update public.questionnaire_definition_versions
    set state = 'published', published_at = now(), updated_at = now()
    where definition_id = p_definition_id and version = p_version;
  update public.questionnaire_definitions
    set current_published_version = p_version, current_draft_version = 0,
        row_version = row_version + 1, updated_at = now()
    where id = p_definition_id returning * into v_def;
  return jsonb_build_object('definitionId', p_definition_id, 'publishedVersion', p_version, 'rowVersion', v_def.row_version);
end;
$$;

create function public.archive_questionnaire_version(
  p_definition_id uuid,
  p_version integer,
  p_expected_definition_version bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_def public.questionnaire_definitions%rowtype; v_state text;
begin
  perform private.p305_require_admin_aal2();
  select * into v_def from public.questionnaire_definitions where id = p_definition_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'DEFINITION_NOT_FOUND'; end if;
  if v_def.row_version <> p_expected_definition_version then
    raise exception using errcode = '40001', message = 'STALE_DEFINITION_VERSION'; end if;
  select state into v_state from public.questionnaire_definition_versions
    where definition_id = p_definition_id and version = p_version for update;
  if v_state is null or v_state <> 'published' then
    raise exception using errcode = 'P0001', message = 'VERSION_NOT_ARCHIVABLE'; end if;
  update public.questionnaire_definition_versions
    set state = 'archived', archived_at = now(), updated_at = now()
    where definition_id = p_definition_id and version = p_version;
  update public.questionnaire_definitions
    set current_published_version = null, row_version = row_version + 1, updated_at = now()
    where id = p_definition_id returning * into v_def;
  return jsonb_build_object('definitionId', p_definition_id, 'archivedVersion', p_version, 'rowVersion', v_def.row_version);
end;
$$;

revoke all on function public.save_questionnaire_draft(text,text,bigint,jsonb,text) from public, anon;
revoke all on function public.publish_questionnaire_version(uuid,integer,bigint) from public, anon;
revoke all on function public.archive_questionnaire_version(uuid,integer,bigint) from public, anon;
grant execute on function public.save_questionnaire_draft(text,text,bigint,jsonb,text) to authenticated, service_role;
grant execute on function public.publish_questionnaire_version(uuid,integer,bigint) to authenticated, service_role;
grant execute on function public.archive_questionnaire_version(uuid,integer,bigint) to authenticated, service_role;

commit;
