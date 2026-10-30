import assert from 'node:assert/strict';
import test from 'node:test';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

const context = {
  actorProfileId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
};
const branding = {
  name: 'Acme',
  logo_url: null,
  favicon_url: null,
  primary_color: null,
  secondary_color: null,
};
const contact = {
  email_sender_name: null,
  email_reply_to: null,
  terms_url: null,
  privacy_url: null,
};

test('authorized snapshot uses the exact scoped RPC and decodes independent redacted sections', async () => {
  const settings = await import('./tenant-settings');
  const calls: unknown[] = [];
  const snapshot = await settings.getTenantSettingsSnapshot(context, {
    supabase: {
      async rpc(name: string, parameters: unknown) {
        calls.push([name, parameters]);
        return {
          data: {
            branding,
            contact,
            smtp: {
              host: 'smtp.example.com',
              port: 587,
              username: 'user',
              from_address: 'mail@example.com',
              enabled: false,
              has_password: true,
              password_encrypted: 'NEVER_EXPOSE',
            },
            whatsapp: {
              phone_number_id: '12345',
              business_account_id: '67890',
              enabled: true,
              has_token: true,
              access_token_encrypted: 'NEVER_EXPOSE',
            },
            versions: { branding: 1, contact: 2, smtp: 3, whatsapp: 4 },
          },
          error: null,
        };
      },
    },
  });
  assert.deepEqual(calls, [
    [
      'read_assigned_company_settings',
      {
        p_actor_profile_id: context.actorProfileId,
        p_tenant_id: context.tenantId,
        p_company_id: context.companyId,
      },
    ],
  ]);
  assert.equal(snapshot.smtp.status, 'ready');
  assert.deepEqual(snapshot.whatsapp, {
    status: 'ready',
    data: {
      phone_number_id: '12345',
      business_account_id: '67890',
      enabled: true,
      has_access_token: true,
    },
  });
  assert.equal(JSON.stringify(snapshot).includes('NEVER_EXPOSE'), false);
  assert.equal(snapshot.versions.smtp, 3);
});

test('malformed section preserves unrelated safe sources and malformed context fails closed before RPC', async () => {
  const settings = await import('./tenant-settings');
  let calls = 0;
  const deps = {
    supabase: {
      async rpc() {
        calls++;
        return {
          data: {
            branding,
            contact,
            smtp: { password: 'SECRET' },
            whatsapp: null,
            versions: { branding: 0, contact: 0, smtp: 0, whatsapp: 0 },
          },
          error: null,
        };
      },
    },
  };
  const result = await settings.getTenantSettingsSnapshot(context, deps);
  assert.equal(result.branding.status, 'ready');
  assert.equal(result.smtp.status, 'unavailable');
  await settings.getTenantSettingsSnapshot({ ...context, actorProfileId: 'bad' }, deps);
  assert.equal(calls, 1);
});

test('RPC mutation binds scope, validates returned receipt, and sanitizes database errors', async () => {
  const settings = await import('./tenant-settings');
  const mutate = settings.mutateAssignedCompanySettings;
  assert.ok(mutate);
  const operation = { operation_id: '44444444-4444-4444-8444-444444444444', expected_version: 0 };
  const result = await mutate(context, 'branding', operation, branding, null, null, {
    supabase: {
      async rpc(name: string, args: Record<string, unknown>) {
        assert.equal(name, 'mutate_assigned_company_settings');
        assert.equal(args.p_actor_profile_id, context.actorProfileId);
        return {
          data: {
            company_id: context.companyId,
            section: 'branding',
            version: 1,
            operation_id: operation.operation_id,
            password: 'SECRET',
          },
          error: null,
        };
      },
    },
  });
  assert.deepEqual(result, {
    ok: true,
    data: {
      company_id: context.companyId,
      section: 'branding',
      version: 1,
      operation_id: operation.operation_id,
    },
  });
  const denied = await mutate(context, 'branding', operation, branding, null, null, {
    supabase: {
      async rpc() {
        return { data: null, error: { message: 'raw SECRET detail' } };
      },
    },
  });
  assert.deepEqual(denied, { ok: false, code: 'SETTINGS_SAVE_FAILED', errorKey: 'saveFailed' });
});

test('denied and malformed snapshot responses fail closed without exposing RPC diagnostics', async () => {
  const settings = await import('./tenant-settings');
  for (const response of [
    { data: { branding, contact }, error: null },
    {
      data: { branding, contact, smtp: null, whatsapp: null, versions: {} },
      error: { message: 'FORBIDDEN SECRET' },
    },
  ]) {
    const snapshot = await settings.getTenantSettingsSnapshot(context, {
      supabase: {
        async rpc() {
          return response;
        },
      },
    });
    for (const section of ['branding', 'contact', 'smtp', 'whatsapp'] as const)
      assert.equal(snapshot[section].status, 'unavailable');
    assert.equal(JSON.stringify(snapshot).includes('SECRET'), false);
  }
});

test('RPC mutation rejects mismatched or malformed receipts and maps only fixed known error codes', async () => {
  const settings = await import('./tenant-settings');
  const operation = { operation_id: '44444444-4444-4444-8444-444444444444', expected_version: 3 };
  const valid = {
    company_id: context.companyId,
    section: 'branding',
    version: 4,
    operation_id: operation.operation_id,
  };
  for (const data of [
    {},
    { ...valid, version: '4' },
    { ...valid, version: 5 },
    { ...valid, company_id: context.tenantId },
    { ...valid, section: 'smtp' },
    { ...valid, operation_id: context.actorProfileId },
  ]) {
    const result = await settings.mutateAssignedCompanySettings(
      context,
      'branding',
      operation,
      branding,
      null,
      null,
      {
        supabase: {
          async rpc() {
            return { data, error: null };
          },
        },
      },
    );
    assert.deepEqual(result, { ok: false, code: 'SETTINGS_SAVE_FAILED', errorKey: 'saveFailed' });
  }
  for (const [code, errorKey] of [
    ['FORBIDDEN', 'forbidden'],
    ['INVALID_SETTINGS_INPUT', 'validation'],
    ['SETTINGS_OPERATION_CONFLICT', 'conflict'],
    ['STALE_SETTINGS_VERSION', 'conflict'],
    ['SETTINGS_CREDENTIAL_REQUIRED', 'credentialRequired'],
  ] as const) {
    const result = await settings.mutateAssignedCompanySettings(
      context,
      'branding',
      operation,
      branding,
      null,
      null,
      {
        supabase: {
          async rpc() {
            return { data: null, error: { message: code } };
          },
        },
      },
    );
    assert.deepEqual(result, { ok: false, code, errorKey });
  }
});
