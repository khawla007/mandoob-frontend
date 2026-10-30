import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ApiError } from '@/lib/errors';
import {
  MAX_BANK_EVIDENCE_BYTES,
  coordinateBankEvidenceUpload,
  signBankEvidenceAccess,
  type BankEvidenceDependencies,
} from './p3-07-bank-evidence-adapter';

const id = (digit: string) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const IDS = {
  actorId: id('1'),
  tenantId: id('2'),
  companyId: id('3'),
  customerProfileId: id('4'),
  invoiceId: id('5'),
  operationId: id('6'),
  submissionId: id('7'),
  documentId: id('8'),
  versionId: id('9'),
};
const pdf = new Uint8Array(Buffer.from('%PDF-1.7\nfixture'));
const input = {
  actorId: IDS.actorId,
  tenantId: IDS.tenantId,
  companyId: IDS.companyId,
  customerProfileId: IDS.customerProfileId,
  invoiceId: IDS.invoiceId,
  operationId: IDS.operationId,
  file: { data: pdf, filename: 'receipt.pdf', mimeType: 'application/pdf' },
  policyKey: null,
  expiresAt: null,
};

function dependencies(overrides: Partial<BankEvidenceDependencies> = {}): BankEvidenceDependencies {
  return {
    prepare: async () => ({
      status: 'prepared',
      operationId: IDS.operationId,
      submissionId: IDS.submissionId,
    }),
    upload: async () => ({
      status: 'finalized',
      operationId: IDS.operationId,
      documentId: IDS.documentId,
      versionId: IDS.versionId,
    }),
    finalize: async () => ({
      status: 'pending',
      operationId: IDS.operationId,
      submissionId: IDS.submissionId,
      documentId: IDS.documentId,
      versionId: IDS.versionId,
      replayed: false,
    }),
    resolveAccess: async () => ({
      status: 'allowed',
      documentId: IDS.documentId,
      versionId: IDS.versionId,
    }),
    sign: async () => ({
      url: 'https://example.test/signed?token=secret',
      expiresAt: '2026-09-22T09:21:00.000Z',
    }),
    ...overrides,
  };
}

test('bank evidence uses the frozen P3.07 upload contract and binds only its immutable receipt', async () => {
  const calls: unknown[] = [];
  const result = await coordinateBankEvidenceUpload(
    input,
    dependencies({
      upload: async (value) => {
        calls.push(value);
        return {
          status: 'finalized',
          operationId: IDS.operationId,
          documentId: IDS.documentId,
          versionId: IDS.versionId,
        };
      },
      finalize: async (value) => {
        calls.push(value);
        return {
          status: 'pending',
          operationId: IDS.operationId,
          submissionId: IDS.submissionId,
          documentId: IDS.documentId,
          versionId: IDS.versionId,
          replayed: false,
        };
      },
    }),
  );
  const upload = calls[0] as Record<string, unknown>;
  assert.equal(upload.docType, 'other');
  assert.equal(upload.label, 'Bank transfer evidence');
  assert.equal(upload.requestId, null);
  assert.equal(upload.documentId, null);
  assert.equal((upload.file as { maxBytes: number }).maxBytes, MAX_BANK_EVIDENCE_BYTES);
  assert.deepEqual(calls[1], {
    actorId: IDS.actorId,
    tenantId: IDS.tenantId,
    companyId: IDS.companyId,
    customerProfileId: IDS.customerProfileId,
    invoiceId: IDS.invoiceId,
    operationId: IDS.operationId,
    submissionId: IDS.submissionId,
    documentId: IDS.documentId,
    versionId: IDS.versionId,
  });
  assert.equal(result.status, 'pending');
  assert.equal(JSON.stringify(result).includes('path'), false);
  assert.equal(JSON.stringify(result).includes('url'), false);
});

test('bank evidence accepts only PDF/JPEG/PNG with matching magic and a 10 MiB ceiling', async () => {
  const invalid = [
    {
      data: new Uint8Array(MAX_BANK_EVIDENCE_BYTES + 1),
      filename: 'large.pdf',
      mimeType: 'application/pdf',
    },
    {
      data: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      filename: 'sheet.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    { data: pdf, filename: 'receipt.png', mimeType: 'image/png' },
    {
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      filename: 'photo.jpg',
      mimeType: 'image/png',
    },
  ];
  for (const file of invalid) {
    await assert.rejects(
      coordinateBankEvidenceUpload({ ...input, file }, dependencies()),
      ApiError,
    );
  }
  for (const file of [
    { data: pdf, filename: 'receipt.pdf', mimeType: 'application/pdf' },
    {
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      filename: 'photo.jpeg',
      mimeType: 'image/jpeg',
    },
    {
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      filename: 'shot.png',
      mimeType: 'image/png',
    },
  ])
    assert.equal(
      (await coordinateBankEvidenceUpload({ ...input, file }, dependencies())).status,
      'pending',
    );
});

test('authorization/invoice/malware/replay failures stay sanitized and never trigger final binding', async () => {
  for (const failure of [
    new ApiError('FORBIDDEN', 'wrong customer private row', 403),
    new ApiError('NOT_FOUND', 'cross-company invoice path', 404),
    new ApiError('CONFLICT', 'invoice paid or operation changed', 409),
    new ApiError('MALWARE_DETECTED', 'scanner signature EICAR', 422),
  ]) {
    let finalized = false;
    const atUpload = failure.code === 'MALWARE_DETECTED';
    await assert.rejects(
      coordinateBankEvidenceUpload(
        input,
        dependencies({
          prepare: async () => {
            if (!atUpload) throw failure;
            return {
              status: 'prepared',
              operationId: IDS.operationId,
              submissionId: IDS.submissionId,
            };
          },
          upload: async () => {
            throw failure;
          },
          finalize: async () => {
            finalized = true;
            throw new Error('must not run');
          },
        }),
      ),
      (error: unknown) =>
        error instanceof ApiError &&
        !error.message.includes('private') &&
        !error.message.includes('path') &&
        !error.message.includes('EICAR'),
    );
    assert.equal(finalized, false);
  }
});

test('finalized P3.07 evidence is never physically compensated and retry recovers an orphaned binding', async () => {
  let uploads = 0;
  let finalizeAttempts = 0;
  const deps = dependencies({
    upload: async () => {
      uploads += 1;
      return {
        status: 'finalized',
        operationId: IDS.operationId,
        documentId: IDS.documentId,
        versionId: IDS.versionId,
      };
    },
    finalize: async () => {
      finalizeAttempts += 1;
      if (finalizeAttempts === 1) throw new Error('database unavailable / storage path private');
      return {
        status: 'pending',
        operationId: IDS.operationId,
        submissionId: IDS.submissionId,
        documentId: IDS.documentId,
        versionId: IDS.versionId,
        replayed: true,
      };
    },
  });
  await assert.rejects(
    coordinateBankEvidenceUpload(input, deps),
    (error: unknown) =>
      error instanceof ApiError && error.message === 'Bank evidence could not be completed',
  );
  const recovered = await coordinateBankEvidenceUpload(input, deps);
  assert.equal(uploads, 2); // P3.07 exact replay supplies the same receipt; no cleanup API exists here.
  assert.equal(recovered.replayed, true);
  assert.equal('cleanup' in deps, false);
});

test('reviewer signing is bounded, finance-authorized first, and does not mutate retention', async () => {
  const calls: unknown[] = [];
  const deps = dependencies({
    resolveAccess: async (value) => (
      calls.push(value),
      { status: 'allowed', documentId: IDS.documentId, versionId: IDS.versionId }
    ),
    sign: async (value) => (
      calls.push(value),
      { url: 'https://example.test/private', expiresAt: '2026-09-22T09:21:00.000Z' }
    ),
  });
  await signBankEvidenceAccess(
    {
      actorId: IDS.actorId,
      tenantId: IDS.tenantId,
      companyId: IDS.companyId,
      submissionId: IDS.submissionId,
      lifetimeSeconds: 120,
    },
    deps,
  );
  assert.deepEqual(calls[1], {
    actorId: IDS.actorId,
    tenantId: IDS.tenantId,
    companyId: IDS.companyId,
    documentId: IDS.documentId,
    versionId: IDS.versionId,
    lifetimeSeconds: 120,
  });
  assert.equal(JSON.stringify(calls).includes('expiresAt'), false);
  for (const lifetimeSeconds of [0, 301, 1.5])
    await assert.rejects(
      signBankEvidenceAccess(
        {
          actorId: IDS.actorId,
          tenantId: IDS.tenantId,
          companyId: IDS.companyId,
          submissionId: IDS.submissionId,
          lifetimeSeconds,
        },
        deps,
      ),
      ApiError,
    );
});

test('migration enforces retention/hold/tombstone policy and contains no physical purge surface', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260922092000_p309_bank_evidence.sql'),
    'utf8',
  );
  assert.match(sql, /document_id uuid,[\s\S]*version_id uuid,/iu);
  assert.match(
    sql,
    /foreign key \(tenant_id, company_id, document_id\)[\s\S]*foreign key \(tenant_id, document_id, version_id\)/iu,
  );
  assert.doesNotMatch(sql, /filename|storage_path|signed_url|bank_account|blob/iu);
  assert.match(sql, /policy_key text[\s\S]*expires_at timestamptz/iu);
  assert.match(sql, /legal_hold boolean not null default false/iu);
  assert.match(sql, /investigation_hold boolean not null default false/iu);
  assert.match(sql, /tombstoned_at timestamptz/iu);
  assert.match(sql, /expires_at is null/iu);
  assert.match(sql, /legal_hold is true[\s\S]*investigation_hold is true/iu);
  assert.match(sql, /review_state\s*=\s*'clean'/iu);
  assert.match(sql, /set search_path = ''/iu);
  assert.match(
    sql,
    /revoke all on function public\.p309_(prepare|finalize|review)_bank_evidence/iu,
  );
  assert.doesNotMatch(
    sql,
    /delete\s+from\s+public\.(documents|document_versions)|storage\.objects|cleanup_document/iu,
  );
});

test('review cannot precede final binding or let finalize inherit an earlier decision', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260922092000_p309_bank_evidence.sql'),
    'utf8',
  );
  const review =
    sql.match(/create function public\.p309_review_bank_evidence[\s\S]*?\n\$\$;/u)?.[0] ?? '';
  const finalize =
    sql.match(/create function public\.p309_finalize_bank_evidence[\s\S]*?\n\$\$;/u)?.[0] ?? '';
  assert.match(review, /document_id is null[\s\S]*version_id is null[\s\S]*finalized_at is null/iu);
  assert.match(finalize, /review_state is distinct from 'pending'/iu);
  assert.match(finalize, /reviewed_by is not null[\s\S]*reviewed_at is not null/iu);
});

test('review is versioned and replay-safe and emits only frozen reference-only v1 events', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260922092000_p309_bank_evidence.sql'),
    'utf8',
  );
  assert.match(sql, /create table public\.bank_evidence_operation_receipts/iu);
  assert.match(sql, /unique \(actor_id, operation_id\)/iu);
  const review =
    sql.match(/create function public\.p309_review_bank_evidence[\s\S]*?\n\$\$;/u)?.[0] ?? '';
  assert.match(
    review,
    /p_operation_id uuid[\s\S]*p_expected_version bigint[\s\S]*p_payload_hash text/iu,
  );
  assert.match(review, /OPERATION_REUSED/iu);
  assert.match(review, /expected_version/iu);
  assert.match(sql, /'finance\.bank_evidence\.submitted', 1/iu);
  assert.match(sql, /'finance\.bank_evidence\.reviewed', 1/iu);
  assert.doesNotMatch(sql, /finance\.bank_evidence\.(?:expired|held|tombstoned|opened)/iu);
  assert.match(sql, /p309_publish_event\([\s\S]*finance\.bank_evidence\.submitted/iu);
  assert.match(sql, /p309_publish_event\([\s\S]*finance\.bank_evidence\.reviewed/iu);
});

test('evidence-backed allocation replays before state gating and versions/audits first success', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260922092000_p309_bank_evidence.sql'),
    'utf8',
  );
  const allocation =
    sql.match(/create function public\.p309_allocate_reviewed_bank_payment[\s\S]*?\n\$\$;/u)?.[0] ??
    '';
  const replayIndex = allocation.indexOf('p309_command_replay');
  const evidenceIndex = allocation.indexOf("review_state<>'clean'");
  assert.ok(replayIndex >= 0 && evidenceIndex > replayIndex);
  assert.match(allocation, /OPERATION_REUSED|p309_command_replay/iu);
  assert.match(allocation, /version=version\+1/iu);
  assert.match(allocation, /p309_command_audit[\s\S]*finance\.bank_evidence_reconciled/iu);
  assert.doesNotMatch(allocation, /finance\.bank_evidence\.reviewed/iu);
});
