\set ON_ERROR_STOP on
set statement_timeout = '15s';

\! rm -f /tmp/delivery-status-a-locked

begin;
delete from public.outbound_sms where provider_message_id = 'LSW1-CONCURRENT-SMS';
delete from public.tenants where id = '93600000-0000-4000-8000-000000000099';
insert into public.tenants (id, slug, name, status)
values ('93600000-0000-4000-8000-000000000099', 'launch-security-concurrency', 'Launch Security Concurrency', 'active');
insert into public.outbound_sms (
  tenant_id, template_id, to_phone, body, provider, sender_id, status,
  provider_message_id, scheduled_for
) values (
  '93600000-0000-4000-8000-000000000099', 'fixture', '+966500000099', 'synthetic',
  'twilio', 'fixture', 'pending', 'LSW1-CONCURRENT-SMS', '2026-10-31T03:00:00Z'
);
commit;
