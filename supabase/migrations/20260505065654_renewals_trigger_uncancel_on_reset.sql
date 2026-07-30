-- 0022_renewals_trigger_uncancel_on_reset.sql
-- Step 15 follow-up — refine renewals_sync_from_license trigger.
--
-- Problem: 0020 preserved both 'completed' and 'cancelled' on upsert.
-- That made cancelled sticky, so clearing then re-setting clients.license_expiry
-- left the auto-row cancelled — wrong, because the source of truth is
-- clients.license_expiry. Cancelled belongs to the "license cleared" path only.
--
-- Fix: preserve 'completed' (PRO marked the work done — terminal) but allow
-- the upsert to overwrite 'cancelled' back into the active status range when
-- license_expiry comes back. Cancelled becomes a transient state that the
-- trigger flips on/off in lockstep with license_expiry presence.

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
      public.compute_notify_at(NEW.license_expiry),
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
