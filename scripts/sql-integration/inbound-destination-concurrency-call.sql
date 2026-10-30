select destination_id, enabled, replayed
from public.provision_inbound_destination(
  'unifonic',
  '91900000-0000-4000-8000-000000000001',
  null,
  null,
  'v1:' || repeat('c', 64),
  false,
  false,
  '91900000-0000-4000-8000-000000000002',
  '91900000-0000-4000-8000-000000000003'
);
