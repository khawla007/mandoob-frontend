-- 0028_renewals_schedule_per_type.sql
-- Step 18a — broaden renewal reminder schedule to PRD windows.
--
-- Keeps the renewal schedule source of truth in SQL, where both the
-- clients.license_expiry trigger and app-layer manual renewals can reuse it.

create or replace function public.compute_notify_at(due date, renewal_type text)
returns timestamptz[]
language sql
stable
set search_path = public
as $$
  with offsets(days) as (
    select unnest(
      case lower(coalesce(renewal_type, ''))
        when 'license' then array[90, 60, 30, 14, 7, 3, 1]
        when 'visa' then array[90, 60, 30, 14, 7, 3, 1]
        when 'eid' then array[90, 60, 30, 14, 7, 3, 1]
        when 'establishment_card' then array[60, 30, 14, 7]
        when 'ejari' then array[90, 60, 30]
        when 'medical' then array[60, 30, 14]
        else array[30, 7, 1]
      end
    )
  ),
  schedule(t) as (
    select ((due - days)::text || ' 08:00 Asia/Dubai')::timestamptz
    from offsets
  )
  select coalesce(array_agg(t order by t), '{}'::timestamptz[])
  from schedule
  where t > now();
$$;

create or replace function public.renewals_sync_from_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id uuid;
  v_action text;
  v_was_insert boolean;
begin
  if NEW.license_expiry is not null then
    insert into public.renewals (
      tenant_id, client_id, type, label, due_date, notify_at, source, status
    )
    values (
      NEW.tenant_id, NEW.id, 'license',
      'Trade license — ' || coalesce(NEW.trade_license_no, NEW.company_name),
      NEW.license_expiry,
      public.compute_notify_at(NEW.license_expiry, 'license'),
      'license_backfill',
      case
        when (NEW.license_expiry - current_date) < 0 then 'overdue'
        when (NEW.license_expiry - current_date) <= 30 then 'due_soon'
        else 'upcoming'
      end
    )
    on conflict (tenant_id, client_id, type)
      where source = 'license_backfill'
    do update set
      label      = excluded.label,
      due_date   = excluded.due_date,
      notify_at  = excluded.notify_at,
      status     = case
        when public.renewals.status = 'completed' then 'completed'
        else excluded.status
      end,
      completed_at = case
        when public.renewals.status = 'completed' then public.renewals.completed_at
        else null
      end,
      updated_at = now()
    returning id, (xmax = 0) into v_row_id, v_was_insert;

    if v_was_insert then
      v_action := 'created';
    else
      v_action := 'updated';
    end if;

    insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
    values (
      NEW.tenant_id,
      null,
      v_action,
      'system',
      jsonb_build_object(
        'entity', 'renewal',
        'op', 'license_backfill',
        'renewal_id', v_row_id,
        'client_id', NEW.id,
        'license_expiry', NEW.license_expiry
      )
    );
  else
    update public.renewals
       set status = 'cancelled', updated_at = now()
     where tenant_id = NEW.tenant_id
       and client_id = NEW.id
       and type = 'license'
       and source = 'license_backfill'
       and status not in ('cancelled','completed')
     returning id into v_row_id;

    if v_row_id is not null then
      insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
      values (
        NEW.tenant_id,
        null,
        'cancelled',
        'system',
        jsonb_build_object(
          'entity', 'renewal',
          'op', 'license_backfill',
          'renewal_id', v_row_id,
          'client_id', NEW.id,
          'reason', 'license_expiry_cleared'
        )
      );
    end if;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.renewals_sync_from_license() from public, anon, authenticated;

update public.renewals
   set notify_at = public.compute_notify_at(due_date, type),
       updated_at = now()
 where status not in ('completed','cancelled');

drop function if exists public.compute_notify_at(date);
