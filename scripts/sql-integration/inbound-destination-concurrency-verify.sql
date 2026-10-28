\set ON_ERROR_STOP on

do $concurrent_provisioning_contract$
begin
  if (select count(*) from public.inbound_destinations
      where tenant_id = '91900000-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.inbound_destination_provisioning_receipts
        where operation_id = '91900000-0000-4000-8000-000000000002') <> 1
    or (select count(*) from public.platform_audit_events
        where operation_id = '91900000-0000-4000-8000-000000000002') <> 1
  then raise exception 'PROVISIONING_CONCURRENT_REPLAY_NOT_ATOMIC'; end if;
end;
$concurrent_provisioning_contract$;
