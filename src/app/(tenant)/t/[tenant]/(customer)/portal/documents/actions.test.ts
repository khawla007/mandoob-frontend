import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(customer)/portal/documents/actions.ts'),
  'utf8',
);

test('customer signing uses the exact version relation and linked-company scope regardless of uploader', () => {
  assert.match(source, /requireAuthorizedCustomerLinkedCompanyRead\(slug\)/u);
  assert.match(
    source,
    /document:documents!document_versions_document_id_fkey!inner\(id, tenant_id, company_id\)/u,
  );
  assert.match(source, /\.eq\('tenant_id', ctx\.tenant\.id\)/u);
  assert.doesNotMatch(source, /\.eq\('uploaded_by', ctx\.caller\.id\)/u);
  assert.match(source, /owned\.tenant_id !== ctx\.tenant\.id/u);
  assert.doesNotMatch(source, /owned\.uploaded_by !== ctx\.caller\.id/u);
  assert.match(source, /doc\.company_id !== ctx\.linkedCompanyId/u);
  assert.match(
    source,
    /getCompanyDocumentSignedUrl\([\s\S]*?ctx\.caller\.id,[\s\S]*?ctx\.tenant\.id,[\s\S]*?ctx\.linkedCompanyId,[\s\S]*?versionId/u,
  );
  assert.doesNotMatch(source, /getDocumentSignedUrl\(/u);
});

test('upload and download actions return sanitized Customer-safe errors', () => {
  assert.match(source, /safeCustomerDocumentError/u);
  assert.match(source, /logSafeActionError\('customer\.document\.upload', e\)/u);
  assert.match(source, /logSafeActionError\('customer\.document\.open', e\)/u);
  assert.doesNotMatch(source, /console\.error/u);
  assert.doesNotMatch(source, /error: e\.message/u);
  assert.match(source, /code: CustomerDocumentActionCode/u);
  assert.doesNotMatch(source, /\| \{ ok: false; error: string; code: string \}/u);
});

test('legacy upload directly authorizes the linked Company before reading attacker-controlled form data', () => {
  const start = source.indexOf('export async function uploadDocumentAction');
  const body = source.slice(start, source.indexOf('export async function', start + 1));
  const authorization = body.indexOf('requireAuthorizedCustomerLinkedCompanyRead(slug)');
  const formRead = body.indexOf("formData.get('file')");
  assert.ok(authorization !== -1 && formRead !== -1 && authorization < formRead);
});

test('upload delegates requested-upload replay enforcement to the shared service', () => {
  assert.match(source, /submitCustomerDocumentUpload\(authority, parsed\.data, file/u);
  assert.doesNotMatch(source, /\.from\('document_requests'\)/u);
});

test('upload validates and forwards the client operation id to the coordinator-backed DAL', () => {
  assert.match(source, /operation_id: formData\.get\('operation_id'\)/u);
  assert.match(source, /submitCustomerDocumentUpload\(authority, parsed\.data, file/u);
});
