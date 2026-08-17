import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseClientDetailSearch } from './page-logic';

test('client document targeting validates identifiers and selects the documents tab', () => {
  const requestId = '99999999-9999-4999-8999-999999999999';
  assert.deepEqual(parseClientDetailSearch({ tab: 'documents', request: [requestId, 'ignored'] }), {
    tab: 'documents',
    requestId,
    documentId: undefined,
  });
  assert.deepEqual(parseClientDetailSearch({ tab: 'bad', document: 'bad' }), {
    tab: 'overview',
    requestId: undefined,
    documentId: undefined,
  });
});

test('client page consumes document focus only after tenant/client-scoped data loads', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/clients/[clientId]/page.tsx'),
    'utf8',
  );
  const tabs = readFileSync(join(process.cwd(), 'src/components/pro/ClientTabs.tsx'), 'utf8');
  const documents = readFileSync(
    join(process.cwd(), 'src/components/pro/DocumentsTab.tsx'),
    'utf8',
  );
  assert.match(page, /getClientForTenant\(tenant\.id, clientId\)/);
  assert.match(page, /listDocumentsForClient\(tenant\.id, clientId\)/);
  assert.match(page, /initialTab=\{focus\.tab\}/);
  assert.match(page, /focusedRequestId=\{focus\.requestId\}/);
  assert.match(page, /focusedDocumentId=\{focus\.documentId\}/);
  assert.match(tabs, /defaultValue=\{initialTab\}/);
  assert.match(documents, /focusedRequestId === req\.id/);
  assert.match(documents, /focusedDocumentId === doc\.documentId/);
});

test('client page passes a bound server action across the client component boundary', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/clients/[clientId]/page.tsx'),
    'utf8',
  );

  assert.match(page, /loadOlderCommsAction\.bind\(null, slug, clientId\)/u);
  assert.doesNotMatch(page, /loadOlderCommsAction\.bind\(null, tenant\.id/u);
  assert.doesNotMatch(page, /const loadOlder = async/u);
});

test('older communications action derives tenant scope from the PRO-only slug boundary', () => {
  const action = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/clients/[clientId]/comms-actions.ts'),
    'utf8',
  );

  assert.match(action, /loadOlderCommsAction\(\s*slug: string,/u);
  assert.match(action, /await requireProTenantRouteAccess\(slug\)/u);
  assert.match(action, /getClientForTenant\(tenant\.id, clientId\)/u);
  assert.match(action, /getCommsForClient\(tenant\.id, clientId,/u);
  assert.doesNotMatch(action, /requireRole|isPlatformOperatorRole/u);
  assert.doesNotMatch(action, /tenantId: string/u);
});
