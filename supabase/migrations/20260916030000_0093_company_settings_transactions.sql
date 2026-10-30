begin;

-- Tenant row locking serializes settings across sections and assignment holders.
create table public.company_settings_versions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  section text not null check (section in ('branding','contact','smtp','whatsapp')),
  version bigint not null default 0 check (version >= 0),
  primary key (tenant_id, section)
);
create table public.company_settings_operations (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  payload_digest bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, operation_id)
);
alter table public.company_settings_versions enable row level security;
alter table public.company_settings_operations enable row level security;
revoke all on public.company_settings_versions, public.company_settings_operations from public, anon, authenticated;
grant all on public.company_settings_versions, public.company_settings_operations to service_role;

-- Deliberately bounded URL subset shared by every settings URL: lowercase
-- HTTP(S), ASCII DNS labels or exact IPv4 or bracketed IPv6, optional decimal
-- port 1..65535. No userinfo, backslashes, IPv6 zone identifiers or whitespace.
-- Nullable URLs clear the field. IDNs must arrive as ASCII punycode.
create function public.is_valid_company_settings_http_url(p_url text)
returns boolean language plpgsql immutable security definer set search_path = '' as $$
declare
  v_parts text[];
  v_authority text;
  v_host text;
  v_port text;
  v_label text;
begin
  if p_url is null then return true; end if;
  if char_length(p_url) not between 1 and 2048 or p_url ~ '[[:space:][:cntrl:]]'
    or pg_catalog.strpos(p_url,pg_catalog.chr(92)) > 0 then return false; end if;
  v_parts := pg_catalog.regexp_match(p_url,'^https?://([^/?#]+)([/?#][^[:space:]]*)?$');
  if v_parts is null then return false; end if;
  v_authority := v_parts[1];
  if v_authority ~ '@' then return false; end if;
  if pg_catalog.left(v_authority,1) = '[' then
    v_parts := pg_catalog.regexp_match(v_authority,'^\[([0-9A-Fa-f:.]+)\](:([0-9]{1,5}))?$');
    if v_parts is null then return false; end if;
    v_host := v_parts[1]; v_port := v_parts[3];
    if pg_catalog.family(v_host::inet) <> 6 then return false; end if;
  else
    v_parts := pg_catalog.regexp_match(v_authority,'^([^:]+)(:([0-9]{1,5}))?$');
    if v_parts is null then return false; end if;
    v_host := v_parts[1]; v_port := v_parts[3];
    if char_length(v_host) > 253 then return false; end if;
    if v_host ~ '^[0-9.]+$' then
      if v_host !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' then return false; end if;
      if pg_catalog.family(v_host::inet) <> 4 then return false; end if;
    else
      foreach v_label in array pg_catalog.string_to_array(v_host,'.') loop
        if v_label !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$' then return false; end if;
      end loop;
    end if;
  end if;
  if v_port is not null and v_port::integer not between 1 and 65535 then return false; end if;
  return true;
exception when invalid_text_representation then
  -- Never return the failing address or PostgreSQL cast diagnostics.
  return false;
end;
$$;

create function public.authorize_assigned_company_settings(p_actor_profile_id uuid, p_tenant_id uuid, p_company_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_company_assignment_resources(p_company_id, array[p_actor_profile_id]);
  perform 1 from public.profiles where id = p_actor_profile_id
    and tenant_id = p_tenant_id and role = 'pro' and status = 'active' for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  perform 1 from public.pro_profiles where profile_id = p_actor_profile_id and public.has_current_pro_credential(p_actor_profile_id) for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  perform 1 from public.tenants where id = p_tenant_id and status = 'active' for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  perform 1 from public.company_profiles where id = p_company_id and tenant_id = p_tenant_id
    and status not in ('suspended','churned') for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  perform 1 from public.pro_company_assignments where company_id = p_company_id
    and tenant_id = p_tenant_id and pro_profile_id = p_actor_profile_id and status = 'active' for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
end;
$$;

create function public.read_assigned_company_settings(p_actor_profile_id uuid, p_tenant_id uuid, p_company_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.authorize_assigned_company_settings(p_actor_profile_id,p_tenant_id,p_company_id);
  select jsonb_build_object(
    'branding',jsonb_build_object('name',t.name,'logo_url',t.logo_url,'favicon_url',t.favicon_url,'primary_color',t.primary_color,'secondary_color',t.secondary_color),
    'contact',jsonb_build_object('email_sender_name',t.email_sender_name,'email_reply_to',t.email_reply_to,'terms_url',t.terms_url,'privacy_url',t.privacy_url),
    'smtp',(select jsonb_build_object('host',s.host,'port',s.port,'username',s.username,'from_address',s.from_address,'enabled',s.enabled,'has_password',coalesce(length(s.password_encrypted)>0,false)) from public.tenant_smtp_config s where s.tenant_id=p_tenant_id),
    'whatsapp',(select jsonb_build_object('business_account_id',w.business_account_id,'phone_number_id',w.phone_number_id,'enabled',w.enabled,'has_token',coalesce(length(w.access_token_encrypted)>0,false)) from public.tenant_whatsapp_config w where w.tenant_id=p_tenant_id),
    'versions',(select jsonb_object_agg(section,coalesce((select version from public.company_settings_versions v where v.tenant_id=p_tenant_id and v.section=sections.section),0)) from unnest(array['branding','contact','smtp','whatsapp']) as sections(section))
  ) into v_result from public.tenants t where t.id=p_tenant_id;
  return v_result;
end;
$$;

create function public.mutate_assigned_company_settings(
  p_actor_profile_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_section text, p_operation_id uuid, p_expected_version bigint, p_input jsonb,
  p_replacement_secret_encrypted text default null,
  p_replacement_secret_fingerprint text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_expected text[];
  v_keys text[];
  v_key text;
  v_value text;
  v_normalized jsonb := '{}'::jsonb;
  v_digest bytea;
  v_version bigint;
  v_result jsonb;
  v_replay public.company_settings_operations;
begin
  -- Authorization precedes validation and every replay lookup, including retries.
  perform public.authorize_assigned_company_settings(p_actor_profile_id,p_tenant_id,p_company_id);
  if p_operation_id is null or p_expected_version is null or p_expected_version < 0
    or p_section is null or p_section not in ('branding','contact','smtp','whatsapp')
    or p_input is null or jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 16384 then
    raise exception using errcode='22023', message='INVALID_SETTINGS_INPUT';
  end if;
  v_expected := case p_section
    when 'branding' then array['favicon_url','logo_url','name','primary_color','secondary_color']
    when 'contact' then array['email_reply_to','email_sender_name','privacy_url','terms_url']
    when 'smtp' then array['enabled','from_address','host','port','username']
    when 'whatsapp' then array['business_account_id','enabled','phone_number_id'] end;
  select array_agg(key order by key) into v_keys from jsonb_object_keys(p_input) as key;
  if v_keys is null or v_keys <> v_expected then
    raise exception using errcode='22023', message='INVALID_SETTINGS_INPUT';
  end if;
  foreach v_key in array v_expected loop
    if v_key = 'enabled' then
      if jsonb_typeof(p_input->'enabled') <> 'boolean' then raise exception using errcode='22023', message='INVALID_SETTINGS_INPUT'; end if;
      v_normalized := v_normalized || jsonb_build_object(v_key,p_input->v_key);
    elsif v_key = 'port' then
      if jsonb_typeof(p_input->v_key) <> 'number' or (p_input->>v_key) !~ '^[0-9]{1,5}$' then
        raise exception using errcode='22023', message='INVALID_SETTINGS_INPUT';
      end if;
      if (p_input->>v_key)::integer not between 1 and 65535 then raise exception using errcode='22023', message='INVALID_SETTINGS_INPUT'; end if;
      v_normalized := v_normalized || jsonb_build_object(v_key,(p_input->>v_key)::integer);
    else
      if jsonb_typeof(p_input->v_key) not in ('string','null') then raise exception using errcode='22023', message='INVALID_SETTINGS_INPUT'; end if;
      v_value := nullif(btrim(p_input->>v_key),'');
      if char_length(coalesce(v_value,'')) > 2048 or coalesce(v_value,'') ~ '[[:cntrl:]]' then
        raise exception using errcode='22023', message='INVALID_SETTINGS_INPUT';
      end if;
      if (v_key = 'name' and (v_value is null or char_length(v_value) not between 2 and 200))
        or (v_key = 'email_sender_name' and char_length(v_value) > 120)
        or (v_key in ('primary_color','secondary_color') and v_value !~ '^#[0-9a-fA-F]{6}$')
        or (v_key in ('logo_url','favicon_url','terms_url','privacy_url') and not public.is_valid_company_settings_http_url(v_value))
        or (v_key in ('email_reply_to','from_address') and v_value !~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$')
        or (v_key = 'from_address' and (v_value is null or char_length(v_value)>254))
        or (v_key = 'email_reply_to' and char_length(v_value)>254)
        or (v_key = 'host' and (v_value is null or char_length(v_value)>253 or v_value !~ '^[A-Za-z0-9][A-Za-z0-9.-]*$'))
        or (v_key = 'username' and (v_value is null or char_length(v_value)>200))
        or (v_key in ('business_account_id','phone_number_id') and (v_value is null or v_value !~ '^[0-9]{5,32}$')) then
        raise exception using errcode='22023', message='INVALID_SETTINGS_INPUT';
      end if;
      v_normalized := v_normalized || jsonb_build_object(v_key,v_value);
    end if;
  end loop;
  if (p_replacement_secret_encrypted is null) <> (p_replacement_secret_fingerprint is null)
    or (p_replacement_secret_encrypted is not null and (p_section not in ('smtp','whatsapp')
      or octet_length(p_replacement_secret_encrypted) not between 1 and 8192
      or p_replacement_secret_fingerprint !~ '^[0-9a-f]{64}$')) then
    raise exception using errcode='22023', message='INVALID_SETTINGS_INPUT';
  end if;
  -- Ciphertext is randomized. Only a trusted server keyed secret fingerprint
  -- participates in replay identity; neither it nor the input enters audit/result.
  v_digest := pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'actor',p_actor_profile_id,'company',p_company_id,'section',p_section,
    'expected_version',p_expected_version,'input',v_normalized,
    'secret_fingerprint', p_replacement_secret_fingerprint)::text,'UTF8'));
  select * into v_replay from public.company_settings_operations
    where tenant_id=p_tenant_id and operation_id=p_operation_id;
  if found then
    if v_replay.payload_digest <> v_digest then raise exception using errcode='P0001', message='SETTINGS_OPERATION_CONFLICT'; end if;
    return v_replay.result;
  end if;
  insert into public.company_settings_versions(tenant_id,section) values(p_tenant_id,p_section) on conflict do nothing;
  select version into v_version from public.company_settings_versions where tenant_id=p_tenant_id and section=p_section for update;
  if v_version <> p_expected_version then raise exception using errcode='P0001', message='STALE_SETTINGS_VERSION'; end if;
  if p_section='branding' then
    update public.tenants set name=v_normalized->>'name',logo_url=v_normalized->>'logo_url',favicon_url=v_normalized->>'favicon_url',primary_color=v_normalized->>'primary_color',secondary_color=v_normalized->>'secondary_color' where id=p_tenant_id;
  elsif p_section='contact' then
    update public.tenants set email_sender_name=v_normalized->>'email_sender_name',email_reply_to=v_normalized->>'email_reply_to',terms_url=v_normalized->>'terms_url',privacy_url=v_normalized->>'privacy_url' where id=p_tenant_id;
  elsif p_section='smtp' then
    if p_replacement_secret_encrypted is null then
      perform 1 from public.tenant_smtp_config where tenant_id=p_tenant_id and length(password_encrypted)>0 for update;
      if not found then raise exception using errcode='P0001', message='SETTINGS_CREDENTIAL_REQUIRED'; end if;
    end if;
    insert into public.tenant_smtp_config(tenant_id,host,port,username,from_address,enabled,password_encrypted)
    values(p_tenant_id,v_normalized->>'host',(v_normalized->>'port')::integer,v_normalized->>'username',v_normalized->>'from_address',(v_normalized->>'enabled')::boolean,coalesce(p_replacement_secret_encrypted,''))
    on conflict(tenant_id) do update set host=excluded.host,port=excluded.port,username=excluded.username,from_address=excluded.from_address,enabled=excluded.enabled,
      password_encrypted = coalesce(p_replacement_secret_encrypted, public.tenant_smtp_config.password_encrypted);
  else
    if p_replacement_secret_encrypted is null then
      perform 1 from public.tenant_whatsapp_config where tenant_id=p_tenant_id and length(access_token_encrypted)>0 for update;
      if not found then raise exception using errcode='P0001', message='SETTINGS_CREDENTIAL_REQUIRED'; end if;
    end if;
    insert into public.tenant_whatsapp_config(tenant_id,business_account_id,phone_number_id,enabled,access_token_encrypted)
    values(p_tenant_id,v_normalized->>'business_account_id',v_normalized->>'phone_number_id',(v_normalized->>'enabled')::boolean,coalesce(p_replacement_secret_encrypted,''))
    on conflict(tenant_id) do update set business_account_id=excluded.business_account_id,phone_number_id=excluded.phone_number_id,enabled=excluded.enabled,
      access_token_encrypted = coalesce(p_replacement_secret_encrypted, public.tenant_whatsapp_config.access_token_encrypted);
  end if;
  update public.company_settings_versions set version = version + 1 where tenant_id=p_tenant_id and section=p_section returning version into v_version;
  insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details)
    values(p_tenant_id,p_actor_profile_id,'updated','self_serve',jsonb_build_object('entity','company_settings','company_id',p_company_id,'section',p_section,'version',v_version,'operation_id',p_operation_id,'changed_fields',v_expected));
  v_result := jsonb_build_object('company_id',p_company_id,'section',p_section,'version',v_version,'operation_id',p_operation_id);
  insert into public.company_settings_operations(tenant_id,operation_id,payload_digest,result) values(p_tenant_id,p_operation_id,v_digest,v_result);
  return v_result;
end;
$$;

revoke all on function public.is_valid_company_settings_http_url(text) from public, anon, authenticated;
revoke all on function public.authorize_assigned_company_settings(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.read_assigned_company_settings(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.mutate_assigned_company_settings(uuid,uuid,uuid,text,uuid,bigint,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.is_valid_company_settings_http_url(text) to service_role;
grant execute on function public.authorize_assigned_company_settings(uuid,uuid,uuid) to service_role;
grant execute on function public.read_assigned_company_settings(uuid,uuid,uuid) to service_role;
grant execute on function public.mutate_assigned_company_settings(uuid,uuid,uuid,text,uuid,bigint,jsonb,text,text) to service_role;
commit;
