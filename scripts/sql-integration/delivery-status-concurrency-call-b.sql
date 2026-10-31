\set ON_ERROR_STOP on
set lock_timeout = '5s';
set statement_timeout = '15s';

select result ->> 'outcome'
from (
  select public.apply_provider_delivery_status(
    'sms', 'twilio', 'LSW1-CONCURRENT-SMS', 'failed', '2026-10-31T03:01:00Z', '30003'
  ) as result
) as callback;
