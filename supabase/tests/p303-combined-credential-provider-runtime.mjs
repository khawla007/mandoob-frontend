import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createConnection, createServer } from 'node:net';

const expectedDatabase = 'supabase_db_mandoob-p303-combined-j3xcqw';
const expectedStorage = 'supabase_storage_mandoob-p303-combined-j3xcqw';
const expectedApi = 'http://127.0.0.1:56121';
const clamavContainer = process.env.P303_CLAMAV_CONTAINER ?? '';
const clamavPort = Number(process.env.P303_CLAMAV_PORT ?? '0');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

assert.match(clamavContainer, /^mandoob-p303-combined-clamav-[a-z0-9]+$/u);
assert.ok(Number.isInteger(clamavPort) && clamavPort > 0 && clamavPort <= 65_535);

function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    ...options,
  }).trim();
}

function containerEnv(container) {
  const lines = docker([
    'inspect',
    '--format',
    '{{range .Config.Env}}{{println .}}{{end}}',
    container,
  ]).split('\n');
  return Object.fromEntries(
    lines.filter(Boolean).map((line) => {
      const split = line.indexOf('=');
      return [line.slice(0, split), line.slice(split + 1)];
    }),
  );
}

async function waitForHealthy(container, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (docker(['inspect', '--format', '{{.State.Health.Status}}', container]) === 'healthy')
      return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`container_health_timeout:${container}`);
}

function psql(sql) {
  return docker([
    'exec',
    expectedDatabase,
    'psql',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-Atqc',
    `set statement_timeout='15s'; ${sql}`,
  ]);
}

function sqlUuid(value) {
  assert.match(value, uuid);
  return `'${value}'::uuid`;
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function scalar(sql) {
  return psql(sql).split('\n').filter(Boolean).at(-1) ?? '';
}

const managedTriggers = [
  ['public.domain_events', 'domain_events_immutable'],
  ['public.pro_credential_evidence', 'pro_credential_evidence_guard_delete'],
  ['public.pro_credential_evidence', 'emit_pro_evidence_event'],
  ['public.pro_credential_evidence_removals', 'pro_credential_evidence_removals_immutable'],
  ['public.document_access_audit', 'document_access_audit_immutable'],
  ['public.document_lifecycle_audit', 'document_lifecycle_audit_immutable'],
  ['public.document_versions', 'document_versions_immutable'],
  ['public.document_upload_operations', 'document_upload_operations_no_delete'],
];

function triggerSnapshot() {
  const names = managedTriggers.map(([, name]) => `'${name}'`).join(',');
  const snapshot = JSON.parse(
    scalar(`select jsonb_object_agg(tgname,tgenabled order by tgname)::text
      from pg_catalog.pg_trigger where tgname in (${names});`),
  );
  assert.equal(Object.keys(snapshot).length, managedTriggers.length);
  return snapshot;
}

function restoreTriggerStatement(snapshot) {
  const modes = { O: 'enable', D: 'disable', R: 'enable replica', A: 'enable always' };
  return managedTriggers
    .map(([table, name]) => {
      const mode = modes[snapshot[name]];
      assert.ok(mode, `unsupported trigger mode for ${name}`);
      return `alter table ${table} ${mode} trigger ${name};`;
    })
    .join('\n');
}

function expireRemovalLease(evidenceId, status, triggerBaseline) {
  assert.ok(['prepared', 'recovering'].includes(status));
  psql(`begin;
    lock table public.pro_credential_evidence_removals in access exclusive mode;
    alter table public.pro_credential_evidence_removals disable trigger pro_credential_evidence_removals_immutable;
    update public.pro_credential_evidence_removals set lease_expires_at=now()-interval '1 second'
      where evidence_id=${sqlUuid(evidenceId)} and status='${status}';
    ${restoreTriggerStatement(triggerBaseline)}
    commit;`);
  assert.deepEqual(triggerSnapshot(), triggerBaseline);
}

function physicalObjectCount(operationId) {
  assert.match(operationId, uuid);
  return docker(['exec', expectedStorage, 'find', '/mnt', '-type', 'f'])
    .split('\n')
    .filter((path) => path.includes(operationId)).length;
}

function dbSnapshot(actorIds, operationIds) {
  const actors = actorIds.map(sqlUuid).join(',');
  const operations = operationIds.map(sqlUuid).join(',');
  return scalar(`select jsonb_build_object(
    'profiles',(select count(*) from public.profiles where id in (${actors})),
    'credentials',(select count(*) from public.pro_credentials where pro_profile_id in (${actors})),
    'evidence',(select count(*) from public.pro_credential_evidence where pro_profile_id in (${actors})),
    'reservations',(select count(*) from public.pro_credential_evidence_upload_reservations where actor_id in (${actors})),
    'receipts',(select count(*) from public.pro_lifecycle_operation_receipts where operation_id in (${operations})),
    'events',(select count(*) from public.domain_events where correlation_id in (${operations})),
    'jobs',(select count(*) from public.event_jobs where event_id in (
      select id from public.domain_events where correlation_id in (${operations})
    )),
    'objects',(select count(*) from storage.objects where bucket_id='tenant-documents'
      and name like any(array[${actorIds.map((id) => `'pro-credentials/${id}/%'`).join(',')}]))
  )::text;`);
}

const emptySnapshot = {
  jobs: 0,
  events: 0,
  objects: 0,
  evidence: 0,
  profiles: 0,
  receipts: 0,
  credentials: 0,
  reservations: 0,
};

function cleanupDatabase(actorIds, operationIds, triggerBaseline) {
  const actors = actorIds.map(sqlUuid).join(',');
  const operations = operationIds.map(sqlUuid).join(',');
  psql(`begin;
    lock table public.domain_events, public.pro_credential_evidence,
      public.pro_credential_evidence_removals, public.document_access_audit,
      public.document_lifecycle_audit, public.document_versions,
      public.document_upload_operations in access exclusive mode;
    alter table public.domain_events disable trigger domain_events_immutable;
    alter table public.pro_credential_evidence disable trigger pro_credential_evidence_guard_delete;
    alter table public.pro_credential_evidence disable trigger emit_pro_evidence_event;
    alter table public.pro_credential_evidence_removals disable trigger pro_credential_evidence_removals_immutable;
    alter table public.document_access_audit disable trigger document_access_audit_immutable;
    alter table public.document_lifecycle_audit disable trigger document_lifecycle_audit_immutable;
    alter table public.document_versions disable trigger document_versions_immutable;
    alter table public.document_upload_operations disable trigger document_upload_operations_no_delete;
    delete from public.document_access_audit where tenant_id=${sqlUuid(tenantId)}
      or actor_id in (${actors});
    delete from public.document_lifecycle_audit where tenant_id=${sqlUuid(tenantId)};
    delete from public.document_versions where tenant_id=${sqlUuid(tenantId)};
    delete from public.document_upload_operations where tenant_id=${sqlUuid(tenantId)};
    delete from public.documents where tenant_id=${sqlUuid(tenantId)};
    delete from public.document_requests where tenant_id=${sqlUuid(tenantId)};
    delete from public.event_jobs where event_id in (
      select id from public.domain_events
      where correlation_id in (${operations})
         or payload->>'subject_id' in (${actorIds.map((id) => `'${id}'`).join(',')})
         or payload->>'evidence_id' in (${operationIds.map((id) => `'${id}'`).join(',')})
    );
    delete from public.domain_events
      where correlation_id in (${operations})
         or payload->>'subject_id' in (${actorIds.map((id) => `'${id}'`).join(',')})
         or payload->>'evidence_id' in (${operationIds.map((id) => `'${id}'`).join(',')});
    delete from public.auth_events where actor_user_id in (${actors});
    delete from public.pro_lifecycle_operation_receipts
      where entity_id in (${actors})
         or entity_id in (select id from public.pro_credentials where pro_profile_id in (${actors}))
         or operation_id in (${operations});
    delete from public.pro_credential_evidence_upload_reservations where actor_id in (${actors});
    delete from public.pro_credential_evidence where pro_profile_id in (${actors});
    delete from public.pro_credential_evidence_removals where pro_profile_id in (${actors});
    delete from public.pro_credentials where pro_profile_id in (${actors});
    delete from public.pro_profiles where profile_id in (${actors});
    delete from public.company_profiles where id=${sqlUuid(companyId)};
    delete from public.tenants where id=${sqlUuid(tenantId)};
    delete from public.profiles where id in (${actors});
    delete from auth.users where id in (${actors});
    ${restoreTriggerStatement(triggerBaseline)}
    commit;`);
  assert.deepEqual(triggerSnapshot(), triggerBaseline);
}

function makeUpload(credentialId, operationId, expectedVersion, bytes, name = 'license.pdf') {
  const form = new FormData();
  form.set('credentialId', credentialId);
  form.set('expectedVersion', String(expectedVersion));
  form.set('operationId', operationId);
  form.set('file', new File([bytes], name, { type: 'application/pdf' }));
  return new Request('http://localhost/api/v1/account/pro/credentials/evidence', {
    method: 'POST',
    body: form,
  });
}

function makeDelete(credentialId, operationId, expectedVersion) {
  return new Request('http://localhost/api/v1/account/pro/credentials/evidence', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credentialId, operationId, expectedVersion }),
  });
}

async function responseCode(response) {
  const body = await response.clone().json();
  return typeof body?.code === 'string' ? body.code : null;
}

async function rawClamScan(bytes) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: clamavPort });
    let response = '';
    const deadline = setTimeout(() => {
      socket.destroy();
      reject(new Error('clamav_raw_timeout'));
    }, 10_000);
    socket.once('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0'));
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.byteLength);
      socket.write(length);
      socket.write(bytes);
      socket.end(Buffer.alloc(4));
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });
    socket.once('error', reject);
    socket.once('end', () => {
      clearTimeout(deadline);
      resolve(response);
    });
  });
}

async function withSilentScanner(run) {
  const sockets = new Set();
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.once('close', () => sockets.delete(socket));
    socket.on('data', () => undefined);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run({ host: '127.0.0.1', port: address.port });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

const actorId = randomUUID();
const foreignActorId = randomUUID();
const adminActorId = randomUUID();
const tenantId = randomUUID();
const companyId = randomUUID();
const requestId = randomUUID();
const generalUploadOperation = randomUUID();
const draftOperation = randomUUID();
const foreignDraftOperation = randomUUID();
const uploadOperation = randomUUID();
const compensationOperation = randomUUID();
const removalOperation = randomUUID();
const staleRecoveryOperation = randomUUID();
const recoveryOperation = randomUUID();
const allActors = [actorId, foreignActorId, adminActorId];
const allOperations = [
  draftOperation,
  foreignDraftOperation,
  uploadOperation,
  compensationOperation,
  removalOperation,
  staleRecoveryOperation,
  recoveryOperation,
  generalUploadOperation,
];
const ownedPaths = [];
let service;
let createdBucket = false;
let triggerBaseline;
let runtimeError;

try {
  assert.equal(
    docker(['inspect', '--format', '{{.Name}}', expectedDatabase]),
    `/${expectedDatabase}`,
  );
  assert.equal(
    docker(['inspect', '--format', '{{.Name}}', expectedStorage]),
    `/${expectedStorage}`,
  );
  assert.equal(
    docker(['inspect', '--format', '{{.State.Health.Status}}', clamavContainer]),
    'healthy',
  );

  const storageEnvironment = containerEnv(expectedStorage);
  assert.ok(storageEnvironment.SERVICE_KEY?.length > 20);
  assert.ok(storageEnvironment.ANON_KEY?.length > 20);
  process.env.NEXT_PUBLIC_SUPABASE_URL = expectedApi;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = storageEnvironment.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = storageEnvironment.SERVICE_KEY;
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3103';
  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = String(clamavPort);
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');

  const [
    { createClient },
    { createEvidencePostHandler },
    { createEvidenceDeleteHandler },
    { createEvidenceDownloadHandler },
    { resolveLifecycleTarget },
    { readProCredentialSnapshot },
    {
      recoverAbandonedProCredentialEvidence,
      claimProCredentialEvidenceRemovalRecovery,
      finalizeProCredentialEvidenceRemovalRecovery,
    },
    { issueProCredentialDownloadToken, verifyProCredentialDownloadToken },
    { coordinateDocumentUpload, createDocumentUploadDependencies },
    { signDocumentAccess, createDocumentAccessDependencies },
    { scanFilePrivate },
    adapter,
    errors,
  ] = await Promise.all([
    import('@supabase/supabase-js'),
    import('../../src/app/api/v1/account/pro/credentials/evidence/route-handler.ts'),
    import('../../src/app/api/v1/account/pro/credentials/evidence/[evidenceId]/route-handler.ts'),
    import('../../src/app/api/v1/account/pro/credentials/evidence/download/route-handler.ts'),
    import('../../src/app/api/v1/_shared/pro-lifecycle-routes.ts'),
    import('../../src/lib/data/pro-credentials.ts'),
    import('../../src/lib/data/pro-evidence-removal-recovery.ts'),
    import('../../src/lib/security/pro-credential-download-token.ts'),
    import('../../src/lib/data/document-upload-lifecycle.ts'),
    import('../../src/lib/data/document-access.ts'),
    import('../../src/lib/security/scan-file.ts'),
    import('../../src/lib/pro-lifecycle/credential-document-adapter.ts'),
    import('../../src/lib/errors.ts'),
  ]);
  service = createClient(expectedApi, storageEnvironment.SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const bucketBefore = await service.storage.getBucket('tenant-documents');
  assert.equal(
    bucketBefore.data,
    null,
    'provider drill requires its preflight-absent owned bucket',
  );
  assert.ok(bucketBefore.error, 'missing bucket must be reported by the provider');
  assert.deepEqual(JSON.parse(dbSnapshot(allActors, allOperations)), emptySnapshot);
  triggerBaseline = triggerSnapshot();

  psql(`begin;
    insert into auth.users (
      id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at
    ) values
      (${sqlUuid(actorId)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'p303-provider-owner@example.invalid','synthetic',now(),'{}','{}',now(),now()),
      (${sqlUuid(foreignActorId)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'p303-provider-foreign@example.invalid','synthetic',now(),'{}','{}',now(),now()),
      (${sqlUuid(adminActorId)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'p303-provider-admin@example.invalid','synthetic',now(),'{}','{}',now(),now());
    insert into public.profiles(id,tenant_id,role,status,full_name) values
      (${sqlUuid(actorId)},null,'pro','active','P303 Provider Owner'),
      (${sqlUuid(foreignActorId)},null,'pro','active','P303 Provider Foreign'),
      (${sqlUuid(adminActorId)},null,'super_admin','active','P303 Provider Admin');
    insert into public.pro_profiles(profile_id) values (${sqlUuid(actorId)}),(${sqlUuid(foreignActorId)});
    select public.create_pro_credential_draft(${sqlUuid(actorId)},${sqlUuid(actorId)},
      ${sqlUuid(draftOperation)},repeat('1',64));
    select public.create_pro_credential_draft(${sqlUuid(foreignActorId)},${sqlUuid(foreignActorId)},
      ${sqlUuid(foreignDraftOperation)},repeat('2',64));
    commit;`);
  const credentialId = scalar(
    `select id from public.pro_credentials where pro_profile_id=${sqlUuid(actorId)};`,
  );
  const foreignCredentialId = scalar(
    `select id from public.pro_credentials where pro_profile_id=${sqlUuid(foreignActorId)};`,
  );
  assert.match(credentialId, uuid);
  assert.match(foreignCredentialId, uuid);
  const credentialSnapshot = await readProCredentialSnapshot(actorId, actorId);
  assert.deepEqual(
    credentialSnapshot.credentials.map((credential) => credential.credentialId),
    [credentialId],
  );
  const liveTarget = await resolveLifecycleTarget(actorId, actorId);
  assert.ok(liveTarget);
  assert.deepEqual(liveTarget.credentialIds, [credentialId]);

  const cleanBytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
  const changedBytes = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog /Pages 2 0 R>>endobj\n%%EOF\n',
  );
  const eicar = Buffer.from(
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
  );
  const eicarPdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), eicar, Buffer.from('\n%%EOF\n')]);
  const validated = await adapter.validateCredentialDocumentUpload({
    data: cleanBytes,
    filename: 'license.pdf',
    mimeType: 'application/pdf',
  });
  assert.equal(validated.sizeBytes, cleanBytes.byteLength);
  assert.equal(validated.sha256, sha256(cleanBytes));
  assert.equal(validated.mimeType, 'application/pdf');

  const base = {
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: actorId,
      role: 'pro',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    limit: async () => 'allowed',
    revalidate: () => undefined,
  };

  const aal1 = createEvidencePostHandler({
    ...base,
    requirePro: async () => ({ ...(await base.requirePro()), aal: 'aal1' }),
  });
  let response = await aal1(makeUpload(credentialId, randomUUID(), 0, cleanBytes));
  assert.equal(response.status, 403);
  assert.equal(await responseCode(response), 'AAL2_REQUIRED');

  for (const requirePro of [
    async () => Promise.reject(new Error('inactive authority')),
    async () => Promise.reject(new Error('wrong role authority')),
    async () => Promise.reject(new Error('stale authority')),
  ]) {
    const denied = createEvidencePostHandler({ ...base, requirePro });
    const deniedResponse = await denied(makeUpload(credentialId, randomUUID(), 0, cleanBytes));
    assert.equal(deniedResponse.status, 404);
  }
  assert.equal(
    scalar(`select (not has_function_privilege('authenticated',
      'public.prepare_pro_credential_evidence_upload(uuid,uuid,bigint,uuid,text,uuid,text,text,bigint,text,text,text,timestamptz)',
      'EXECUTE') and not has_function_privilege('authenticated',
      'public.finalize_pro_credential_evidence_upload(uuid,uuid,bigint,uuid,text,uuid,text,text,bigint,text,text,text,timestamptz)',
      'EXECUTE'))::text;`),
    'true',
  );

  const handler = createEvidencePostHandler(base);
  response = await handler(makeUpload(foreignCredentialId, randomUUID(), 0, cleanBytes));
  assert.equal(response.status, 404);
  assert.equal(await responseCode(response), 'NOT_FOUND');

  const unavailableHandler = createEvidencePostHandler({
    ...base,
    scan: (bytes) => scanFilePrivate(bytes, { clamav: null }),
  });
  response = await unavailableHandler(makeUpload(credentialId, randomUUID(), 0, cleanBytes));
  assert.equal(response.status, 503);
  assert.equal(await responseCode(response), 'SCANNER_UNAVAILABLE');

  await withSilentScanner(async (clamav) => {
    const timeoutHandler = createEvidencePostHandler({
      ...base,
      scan: (bytes) => scanFilePrivate(bytes, { clamav, timeoutMs: 75 }),
    });
    const timeoutResponse = await timeoutHandler(
      makeUpload(credentialId, randomUUID(), 0, cleanBytes),
    );
    assert.equal(timeoutResponse.status, 503);
    assert.equal(await responseCode(timeoutResponse), 'SCANNER_UNAVAILABLE');
  });

  assert.match(await rawClamScan(eicar), /FOUND/u, 'real private ClamAV must detect malware');
  response = await handler(makeUpload(credentialId, randomUUID(), 0, eicarPdf));
  assert.equal(response.status, 422);
  assert.equal(await responseCode(response), 'FILE_REJECTED_BY_SCAN');

  const cleanScan = await scanFilePrivate(cleanBytes, { timeoutMs: 10_000 });
  assert.deepEqual(cleanScan, { clean: true, provider: 'clamav' });

  response = await handler(makeUpload(credentialId, uploadOperation, 0, cleanBytes));
  assert.equal(response.status, 500, 'real write must fail while the private bucket is absent');
  assert.equal(await responseCode(response), 'INTERNAL');
  assert.equal(
    scalar(
      `select count(*) from public.pro_credential_evidence where id=${sqlUuid(uploadOperation)};`,
    ),
    '0',
  );
  assert.equal(
    scalar(`select count(*) from storage.objects where bucket_id='tenant-documents';`),
    '0',
  );
  assert.equal(physicalObjectCount(uploadOperation), 0);

  const createBucket = await service.storage.createBucket('tenant-documents', {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  assert.equal(createBucket.error, null);
  createdBucket = true;

  psql(`begin;
    insert into public.tenants(id,slug,name,status)
      values(${sqlUuid(tenantId)},'p303-general-${tenantId.slice(0, 8)}','P303 General Sentinel','active');
    insert into public.company_profiles(id,tenant_id,company_name,status)
      values(${sqlUuid(companyId)},${sqlUuid(tenantId)},'P303 General Sentinel LLC','onboarding');
    insert into public.document_requests(id,tenant_id,company_id,doc_type,label,requested_by)
      values(${sqlUuid(requestId)},${sqlUuid(tenantId)},${sqlUuid(companyId)},'other',
        'P303 general sentinel',${sqlUuid(adminActorId)});
    commit;`);
  const generalSentinel = await coordinateDocumentUpload(
    {
      actorId: adminActorId,
      tenantId,
      companyId,
      operationId: generalUploadOperation,
      requestId,
      documentId: null,
      employeeId: null,
      docType: 'other',
      label: 'P303 general sentinel',
      expectedHead: null,
      file: {
        data: cleanBytes,
        filename: 'general-sentinel.pdf',
        mimeType: 'application/pdf',
        expectedSha256: sha256(cleanBytes),
      },
    },
    createDocumentUploadDependencies(),
  );
  const generalSentinelPath = scalar(
    `select storage_path from public.document_versions where id=${sqlUuid(generalSentinel.versionId)};`,
  );
  ownedPaths.push(generalSentinelPath);
  assert.ok(physicalObjectCount(generalUploadOperation) > 0);
  const sentinelRelationalSnapshot = scalar(`select jsonb_build_object(
    'documents',(select count(*) from public.documents where id=${sqlUuid(generalSentinel.documentId)}),
    'versions',(select count(*) from public.document_versions where id=${sqlUuid(generalSentinel.versionId)}),
    'head',(select current_version_id from public.documents where id=${sqlUuid(generalSentinel.documentId)}),
    'request_status',(select status from public.document_requests where id=${sqlUuid(requestId)}),
    'operations',(select count(*) from public.document_upload_operations where operation_id=${sqlUuid(generalUploadOperation)})
  )::text;`);
  const documentAccessDeps = createDocumentAccessDependencies({
    apiBaseUrl: expectedApi,
    allowHttpLoopback: true,
  });
  const signedSentinel = await signDocumentAccess(
    {
      actorId: adminActorId,
      tenantId,
      companyId,
      documentId: generalSentinel.documentId,
      versionId: generalSentinel.versionId,
      lifetimeSeconds: 30,
    },
    documentAccessDeps,
  );
  assert.match(signedSentinel.url, /\/storage\/v1\/object\/sign\/tenant-documents\//u);
  assert.equal(
    scalar(`select count(*) from public.document_access_audit
      where actor_id=${sqlUuid(adminActorId)} and event='access_granted';`),
    '1',
  );
  await assert.rejects(
    () =>
      signDocumentAccess(
        {
          actorId: foreignActorId,
          tenantId,
          companyId,
          documentId: generalSentinel.documentId,
          versionId: generalSentinel.versionId,
          lifetimeSeconds: 30,
        },
        documentAccessDeps,
      ),
    (error) => error?.code === 'FORBIDDEN',
  );
  assert.equal(
    scalar(`select count(*) from public.document_access_audit
      where actor_id=${sqlUuid(foreignActorId)} and event='access_denied';`),
    '1',
  );
  await assert.rejects(
    () =>
      signDocumentAccess(
        {
          actorId: adminActorId,
          tenantId,
          companyId,
          documentId: generalSentinel.documentId,
          versionId: generalSentinel.versionId,
          lifetimeSeconds: 30,
        },
        {
          ...documentAccessDeps,
          rpc: (name, args, signal) => {
            if (name === 'finalize_document_access_grant')
              throw new Error('synthetic immutable audit failure');
            return documentAccessDeps.rpc(name, args, signal);
          },
        },
      ),
    (error) => error?.code === 'DOCUMENT_ACCESS_FAILED',
  );
  assert.equal(
    scalar(`select count(*) from public.document_access_audit
      where actor_id=${sqlUuid(adminActorId)} and event='access_granted';`),
    '1',
  );

  response = await handler(makeUpload(credentialId, uploadOperation, 0, cleanBytes));
  assert.equal(response.status, 200);
  assert.equal(await responseCode(response), null);
  const uploadPath = `pro-credentials/${actorId}/${credentialId}/${uploadOperation}`;
  ownedPaths.push(uploadPath);
  const evidenceMetadata = JSON.parse(
    scalar(`select jsonb_build_object(
      'mime',mime_type,'size',size_bytes,'sha256',sha256,'scan_provider',scan_provider,
      'original_name_safe',original_name_safe,
      'scan_completed',scan_completed_at between now() - interval '2 minutes' and now(),
      'path_matches',storage_path='${uploadPath}'
    )::text from public.pro_credential_evidence where id=${sqlUuid(uploadOperation)};`),
  );
  assert.deepEqual(evidenceMetadata, {
    mime: 'application/pdf',
    size: cleanBytes.byteLength,
    sha256: sha256(cleanBytes),
    scan_provider: 'clamav',
    original_name_safe: 'license.pdf',
    scan_completed: true,
    path_matches: true,
  });
  const providerMetadata = JSON.parse(
    scalar(`select jsonb_build_object(
      'mime',metadata->>'mimetype','size',(metadata->>'size')::bigint
    )::text from storage.objects where bucket_id='tenant-documents' and name='${uploadPath}';`),
  );
  assert.deepEqual(providerMetadata, { mime: 'application/pdf', size: cleanBytes.byteLength });
  const downloaded = await service.storage.from('tenant-documents').download(uploadPath);
  assert.equal(downloaded.error, null);
  assert.ok(downloaded.data);
  const downloadedBytes = new Uint8Array(await downloaded.data.arrayBuffer());
  assert.equal(downloadedBytes.byteLength, cleanBytes.byteLength);
  assert.equal(sha256(downloadedBytes), sha256(cleanBytes));
  assert.equal(downloaded.data.type, 'application/pdf');
  assert.ok(physicalObjectCount(uploadOperation) > 0);

  const issuedAt = new Date();
  const credentialToken = await issueProCredentialDownloadToken(uploadOperation, issuedAt);
  assert.equal(
    await verifyProCredentialDownloadToken(credentialToken, new Date(issuedAt.getTime() + 299_000)),
    uploadOperation,
  );
  await assert.rejects(() =>
    verifyProCredentialDownloadToken(credentialToken, new Date(issuedAt.getTime() + 300_000)),
  );
  await assert.rejects(() =>
    verifyProCredentialDownloadToken(
      `${credentialToken[0] === 'A' ? 'B' : 'A'}${credentialToken.slice(1)}`,
      issuedAt,
    ),
  );
  const ownerDownload = createEvidenceDownloadHandler({
    requireViewer: base.requirePro,
  });
  let downloadResponse = await ownerDownload(
    new Request('http://localhost/download', {
      headers: { authorization: `Bearer ${credentialToken}` },
    }),
  );
  assert.equal(downloadResponse.status, 200);
  assert.equal(sha256(new Uint8Array(await downloadResponse.arrayBuffer())), sha256(cleanBytes));
  const foreignDownload = createEvidenceDownloadHandler({
    requireViewer: async () => ({ ...(await base.requirePro()), id: foreignActorId }),
  });
  downloadResponse = await foreignDownload(
    new Request('http://localhost/download', {
      headers: { authorization: `Bearer ${credentialToken}` },
    }),
  );
  assert.equal(downloadResponse.status, 404);

  response = await handler(makeUpload(credentialId, uploadOperation, 0, cleanBytes));
  assert.equal(response.status, 200);
  assert.equal(
    scalar(`select concat(
      (select count(*) from public.pro_credential_evidence where id=${sqlUuid(uploadOperation)}),':',
      (select count(*) from public.pro_lifecycle_operation_receipts where operation_id=${sqlUuid(uploadOperation)}),':',
      (select count(*) from public.domain_events where event_type='pro.credential.evidence_changed'
        and payload->>'evidence_id'='${uploadOperation}'
        and payload->>'operation_id'='${uploadOperation}'
        and correlation_id=${sqlUuid(uploadOperation)}),':',
      (select count(*) from public.event_jobs where event_id in (
        select id from public.domain_events where event_type='pro.credential.evidence_changed'
          and payload->>'evidence_id'='${uploadOperation}'))
    );`),
    '1:1:1:1',
  );
  response = await handler(makeUpload(credentialId, uploadOperation, 0, changedBytes));
  assert.equal(response.status, 409);
  assert.equal(await responseCode(response), 'OPERATION_REUSED');

  const completedReplayCorruption = async (bytes, mime, missing = false) => {
    const removed = await service.storage.from('tenant-documents').remove([uploadPath]);
    assert.equal(removed.error, null);
    if (!missing) {
      const replaced = await service.storage.from('tenant-documents').upload(uploadPath, bytes, {
        contentType: mime,
        upsert: false,
      });
      assert.equal(replaced.error, null);
    }
    const replay = await handler(makeUpload(credentialId, uploadOperation, 0, cleanBytes));
    assert.equal(replay.status, 409);
    assert.equal(await responseCode(replay), 'OPERATION_REUSED');
    await service.storage.from('tenant-documents').remove([uploadPath]);
    const restored = await service.storage.from('tenant-documents').upload(uploadPath, cleanBytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    assert.equal(restored.error, null);
  };
  await completedReplayCorruption(cleanBytes, 'application/pdf', true);
  await completedReplayCorruption(changedBytes, 'application/pdf');
  await completedReplayCorruption(cleanBytes, 'image/png');
  assert.equal(
    scalar(`select concat(
      (select count(*) from public.pro_credential_evidence where id=${sqlUuid(uploadOperation)}),':',
      (select count(*) from public.pro_lifecycle_operation_receipts where operation_id=${sqlUuid(uploadOperation)}),':',
      (select count(*) from public.domain_events where event_type='pro.credential.evidence_changed'
        and payload->>'evidence_id'='${uploadOperation}'
        and payload->>'operation_id'='${uploadOperation}'
        and correlation_id=${sqlUuid(uploadOperation)}),':',
      (select count(*) from public.event_jobs where event_id in (
        select id from public.domain_events where event_type='pro.credential.evidence_changed'
          and payload->>'evidence_id'='${uploadOperation}'))
    );`),
    '1:1:1:1',
  );
  const providerUnavailableReplay = createEvidencePostHandler({
    ...base,
    uploadTimeoutMs: 3_000,
  });
  docker(['stop', expectedStorage]);
  const providerUnavailableStartedAt = Date.now();
  response = await providerUnavailableReplay(
    makeUpload(credentialId, uploadOperation, 0, cleanBytes),
  );
  assert.equal(response.status, 503);
  assert.equal(await responseCode(response), 'SERVICE_UNAVAILABLE');
  assert.ok(Date.now() - providerUnavailableStartedAt < 10_000);
  docker(['start', expectedStorage]);
  await waitForHealthy(expectedStorage);

  const compensationPath = `pro-credentials/${actorId}/${credentialId}/${compensationOperation}`;
  ownedPaths.push(compensationPath);
  const compensationHandler = createEvidencePostHandler({
    ...base,
    store: async (path, bytes, mime) => {
      const stored = await service.storage.from('tenant-documents').upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (stored.error) throw stored.error;
      assert.ok(physicalObjectCount(compensationOperation) > 0);
      return 'stored';
    },
    finalize: async () => {
      throw new errors.ApiError(
        'EVIDENCE_UPLOAD_RESERVATION_LOST',
        'synthetic database boundary failure',
        409,
      );
    },
    erase: async (path) => {
      const removed = await service.storage.from('tenant-documents').remove([path]);
      if (removed.error) throw removed.error;
      assert.equal(physicalObjectCount(compensationOperation), 0);
    },
  });
  response = await compensationHandler(
    makeUpload(credentialId, compensationOperation, 1, cleanBytes),
  );
  assert.equal(response.status, 409);
  assert.equal(await responseCode(response), 'EVIDENCE_UPLOAD_RESERVATION_LOST');
  assert.equal(
    scalar(`select count(*) from storage.objects where bucket_id='tenant-documents'
      and name='${compensationPath}';`),
    '0',
    'database-boundary failure must compensate the actual provider object',
  );
  const afterCompensation = await service.storage
    .from('tenant-documents')
    .download(compensationPath);
  assert.ok(afterCompensation.error);
  assert.equal(afterCompensation.data, null);
  assert.equal(physicalObjectCount(compensationOperation), 0);

  response = await handler(makeUpload(credentialId, compensationOperation, 1, cleanBytes));
  assert.equal(
    response.status,
    200,
    'unchanged retry must recover after compensated provider write',
  );
  assert.ok(physicalObjectCount(compensationOperation) > 0);
  assert.equal(
    scalar(`select concat(
      (select count(*) from public.pro_credential_evidence where id=${sqlUuid(compensationOperation)}),':',
      (select count(*) from public.pro_lifecycle_operation_receipts where operation_id=${sqlUuid(compensationOperation)})
    );`),
    '1:1',
  );

  const deleteHandler = createEvidenceDeleteHandler({
    ...base,
    erase: async () => {
      throw new Error('synthetic provider deletion failure');
    },
  });
  response = await deleteHandler(makeDelete(credentialId, removalOperation, 2), {
    params: Promise.resolve({ evidenceId: compensationOperation }),
  });
  assert.equal(response.status, 503);
  assert.equal(await responseCode(response), 'SERVICE_UNAVAILABLE');
  assert.ok(physicalObjectCount(compensationOperation) > 0);
  assert.equal(
    scalar(`select status from public.pro_credential_evidence_removals
      where evidence_id=${sqlUuid(compensationOperation)};`),
    'prepared',
  );
  expireRemovalLease(compensationOperation, 'prepared', triggerBaseline);
  await claimProCredentialEvidenceRemovalRecovery({
    actorId: adminActorId,
    proProfileId: actorId,
    credentialId,
    evidenceId: compensationOperation,
    recoveryOperationId: staleRecoveryOperation,
  });
  expireRemovalLease(compensationOperation, 'recovering', triggerBaseline);
  const recovered = await recoverAbandonedProCredentialEvidence(
    {
      actorId: adminActorId,
      proProfileId: actorId,
      credentialId,
      evidenceId: compensationOperation,
    },
    {
      operationId: () => recoveryOperation,
      finalize: async (input) => {
        await assert.rejects(
          () =>
            finalizeProCredentialEvidenceRemovalRecovery({
              ...input,
              recoveryOperationId: staleRecoveryOperation,
            }),
          (error) => error?.code === 'EVIDENCE_REMOVAL_CLAIM_LOST',
        );
        return finalizeProCredentialEvidenceRemovalRecovery(input);
      },
    },
  );
  assert.equal(recovered.version, 3);
  assert.equal(
    scalar(`select count(*) from public.domain_events event
      where event.event_type='pro.credential.evidence_changed'
        and event.payload->>'evidence_id'='${compensationOperation}'
        and event.payload->>'change'='removed'
        and event.payload->>'operation_id'='${recoveryOperation}'
        and event.correlation_id=${sqlUuid(recoveryOperation)}
        and event.id=private.p303_event_uuid(
          'pro.credential.evidence_changed:1:subject:${actorId}:resource:${credentialId}:evidence:${compensationOperation}:operation:${recoveryOperation}:version:3'
        )
        and event.dedupe_key=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          'pro.credential.evidence_changed:1:subject:${actorId}:resource:${credentialId}:evidence:${compensationOperation}:operation:${recoveryOperation}:version:3',
          'UTF8'
        )),'hex');`),
    '1',
    'Recovered removal event must retain the exact recovery operation as its causal identity',
  );
  assert.equal(physicalObjectCount(compensationOperation), 0);
  const removedObject = await service.storage.from('tenant-documents').download(compensationPath);
  assert.ok(removedObject.error);
  assert.equal(removedObject.data, null);
  const terminalReplay = createEvidenceDeleteHandler(base);
  response = await terminalReplay(makeDelete(credentialId, removalOperation, 2), {
    params: Promise.resolve({ evidenceId: compensationOperation }),
  });
  assert.equal(response.status, 200);
  assert.equal(
    scalar(`select status from public.pro_credential_evidence_removals
      where evidence_id=${sqlUuid(compensationOperation)};`),
    'complete',
  );

  downloadResponse = await ownerDownload(
    new Request('http://localhost/download', {
      headers: {
        authorization: `Bearer ${await issueProCredentialDownloadToken(compensationOperation)}`,
      },
    }),
  );
  assert.equal(downloadResponse.status, 404, 'removed evidence revokes live token access');

  const anonymous = createClient(expectedApi, storageEnvironment.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonymousRead = await anonymous.storage.from('tenant-documents').download(uploadPath);
  assert.ok(anonymousRead.error);
  assert.equal(anonymousRead.data, null);
  const anonymousSentinelRead = await anonymous.storage
    .from('tenant-documents')
    .download(generalSentinelPath);
  assert.ok(anonymousSentinelRead.error);
  assert.equal(anonymousSentinelRead.data, null);
  assert.ok(physicalObjectCount(generalUploadOperation) > 0);
  const sentinelDownload = await service.storage
    .from('tenant-documents')
    .download(generalSentinelPath);
  assert.equal(sentinelDownload.error, null);
  assert.equal(
    sha256(new Uint8Array(await sentinelDownload.data.arrayBuffer())),
    sha256(cleanBytes),
  );
  assert.equal(
    scalar(`select jsonb_build_object(
      'documents',(select count(*) from public.documents where id=${sqlUuid(generalSentinel.documentId)}),
      'versions',(select count(*) from public.document_versions where id=${sqlUuid(generalSentinel.versionId)}),
      'head',(select current_version_id from public.documents where id=${sqlUuid(generalSentinel.documentId)}),
      'request_status',(select status from public.document_requests where id=${sqlUuid(requestId)}),
      'operations',(select count(*) from public.document_upload_operations where operation_id=${sqlUuid(generalUploadOperation)})
    )::text;`),
    sentinelRelationalSnapshot,
  );
  assert.equal(
    scalar(`select not exists(
      select 1 from public.domain_events event
      where (event.payload ->> 'subject_id')::uuid=${sqlUuid(actorId)}
        and (
          event.payload ->> 'operation_id' is null
          or event.correlation_id is distinct from (event.payload ->> 'operation_id')::uuid
        )
    );`),
    't',
    'Provider workflow event lost its causal operation identity',
  );

  console.log(
    JSON.stringify({
      gate: 'p303-combined-credential-provider-runtime',
      cleanProvider: true,
      malwareProvider: true,
      unavailableFailClosed: true,
      timeoutFailClosed: true,
      aalAndOwnership: true,
      authoritativeMetadata: true,
      replayAndConflict: true,
      providerFailureRetry: true,
      compensationRetry: true,
      physicalCompensation: true,
      anonymousPrivateReadDenied: true,
      completedReplayCorruption: true,
      providerUnavailableReplay: true,
      credentialTokenRouteAndRevocation: true,
      providerRemovalRecoveryFencing: true,
      generalSentinelPrivateAndUnchanged: true,
      documentAccessGrantDenialAndAuditFailure: true,
    }),
  );
} catch (error) {
  runtimeError = error;
} finally {
  const cleanupErrors = [];
  const cleanupStages = [
    [
      'Storage restart and health',
      async () => {
        const running = docker(['inspect', '--format', '{{.State.Running}}', expectedStorage]);
        if (running !== 'true') docker(['start', expectedStorage]);
        await waitForHealthy(expectedStorage);
      },
    ],
    [
      'object removal and physical check',
      async () => {
        if (service && ownedPaths.length > 0) {
          const removed = await service.storage.from('tenant-documents').remove(ownedPaths);
          assert.equal(removed.error, null);
        }
        assert.equal(physicalObjectCount(uploadOperation), 0);
        assert.equal(physicalObjectCount(compensationOperation), 0);
        assert.equal(physicalObjectCount(generalUploadOperation), 0);
      },
    ],
    [
      'database cleanup',
      async () => {
        if (triggerBaseline) cleanupDatabase(allActors, allOperations, triggerBaseline);
      },
    ],
    [
      'bucket cleanup',
      async () => {
        if (!service || !createdBucket) return;
        const remaining = scalar(
          "select count(*) from storage.objects where bucket_id='tenant-documents';",
        );
        assert.equal(remaining, '0', 'owned bucket cleanup refuses to remove non-owned objects');
        const removed = await service.storage.deleteBucket('tenant-documents');
        assert.equal(removed.error, null);
        createdBucket = false;
      },
    ],
    [
      'scanner removal',
      async () => {
        const scannerErrors = [];
        try {
          if (docker(['inspect', '--format', '{{.State.Running}}', clamavContainer]) === 'true')
            docker(['stop', clamavContainer]);
        } catch (error) {
          scannerErrors.push(error);
        }
        try {
          docker(['rm', clamavContainer]);
        } catch (error) {
          scannerErrors.push(error);
        }
        if (scannerErrors.length > 0)
          throw new AggregateError(scannerErrors, 'scanner removal failed');
      },
    ],
    [
      'final residue and trigger assertions',
      async () => {
        assert.equal(
          docker(['inspect', '--format', '{{.State.Health.Status}}', expectedStorage]),
          'healthy',
        );
        assert.equal(
          docker(['ps', '-a', '--filter', `name=^/${clamavContainer}$`, '--format', '{{.Names}}']),
          '',
        );
        if (triggerBaseline) assert.deepEqual(triggerSnapshot(), triggerBaseline);
        assert.deepEqual(JSON.parse(dbSnapshot(allActors, allOperations)), emptySnapshot);
        assert.equal(
          scalar(`select concat(
            (select count(*) from storage.buckets where id='tenant-documents'),':',
            (select count(*) from storage.objects where bucket_id='tenant-documents'),':',
            (select count(*) from public.tenants where id=${sqlUuid(tenantId)}),':',
            (select count(*) from public.company_profiles where id=${sqlUuid(companyId)}),':',
            (select count(*) from public.document_requests where id=${sqlUuid(requestId)}),':',
            (select count(*) from public.document_upload_operations where operation_id=${sqlUuid(generalUploadOperation)}),':',
            (select count(*) from public.document_access_audit where tenant_id=${sqlUuid(tenantId)})
          );`),
          '0:0:0:0:0:0:0',
        );
      },
    ],
  ];
  for (const [label, cleanup] of cleanupStages) {
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(new Error(`${label} failed`, { cause: error }));
    }
  }
  if (runtimeError || cleanupErrors.length > 0)
    throw new AggregateError(
      [...(runtimeError ? [runtimeError] : []), ...cleanupErrors],
      'provider runtime or cleanup failed',
    );
}
