begin;

create table public.mfa_factor_removal_reservations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  operation_id uuid not null unique,
  factor_id text not null check (pg_catalog.length(factor_id) between 1 and 255),
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.mfa_factor_removal_reservations owner to postgres;
revoke all on table public.mfa_factor_removal_reservations
  from public, anon, authenticated, service_role;

create or replace function public.reserve_mfa_factor_removal(
  p_user_id uuid,
  p_factor_id text,
  p_operation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null
     or p_operation_id is null
     or p_factor_id is null
     or pg_catalog.length(p_factor_id) not between 1 and 255 then
    raise exception using errcode = '22023', message = 'INVALID_MFA_RESERVATION';
  end if;
  insert into public.mfa_factor_removal_reservations (user_id, operation_id, factor_id)
  values (p_user_id, p_operation_id, p_factor_id)
  on conflict (user_id) do nothing;
  return found;
end;
$$;

alter function public.reserve_mfa_factor_removal(uuid, text, uuid) owner to postgres;
revoke all on function public.reserve_mfa_factor_removal(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_mfa_factor_removal(uuid, text, uuid) to service_role;

create or replace function public.release_mfa_factor_removal(
  p_user_id uuid,
  p_factor_id text,
  p_operation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.mfa_factor_removal_reservations
  where user_id = p_user_id
    and factor_id = p_factor_id
    and operation_id = p_operation_id;
  return found;
end;
$$;

alter function public.release_mfa_factor_removal(uuid, text, uuid) owner to postgres;
revoke all on function public.release_mfa_factor_removal(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.release_mfa_factor_removal(uuid, text, uuid) to service_role;

commit;
