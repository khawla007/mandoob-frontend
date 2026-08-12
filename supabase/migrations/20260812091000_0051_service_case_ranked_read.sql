create or replace view public.service_cases_ranked
with (security_invoker = true)
as
select
  id,
  tenant_id,
  client_id,
  title,
  service_type,
  status,
  priority,
  assigned_to,
  due_at,
  sla_due_at,
  blocked_reason,
  completed_at,
  created_at,
  updated_at,
  case when sla_due_at < now() then 0 else 1 end as sla_breach_rank,
  case priority
    when 'urgent' then 0
    when 'high' then 1
    when 'normal' then 2
    when 'low' then 3
    else 4
  end as priority_rank
from public.service_cases;

revoke all on public.service_cases_ranked from public, anon, authenticated;
grant select on public.service_cases_ranked to service_role;
