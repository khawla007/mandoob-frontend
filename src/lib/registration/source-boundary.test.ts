import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  loadRegistrationIndex,
  loadRegistrationPresentation,
  loadVisaPresentation,
} from './unavailable-adapter';

test('production adapters report stable unavailable states without querying substitute sources', async () => {
  assert.deepEqual(await loadRegistrationIndex(), {
    kind: 'unavailable',
    reason: 'registration_contract_unavailable',
  });
  assert.deepEqual(await loadRegistrationPresentation(), {
    kind: 'unavailable',
    reason: 'registration_contract_unavailable',
  });
  assert.deepEqual(await loadVisaPresentation(), {
    kind: 'unavailable',
    reason: 'visa_contract_unavailable',
  });

  const source = readFileSync(new URL('./unavailable-adapter.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /service_cases|customer-portal|visa_expiry|eid_expiry|document_versions|renewals|audit_logs/u,
  );
  assert.doesNotMatch(source, /createSupabase|\.from\(|\.rpc\(/u);
});
