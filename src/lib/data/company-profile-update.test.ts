import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const input = {
  actorId: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  companyId: '33333333-3333-4333-8333-333333333333',
  expectedUpdatedAt: '2026-08-17T10:00:00.000Z',
  companyName: 'Acme Trading LLC',
  tradeLicenseNo: 'DED-123',
  jurisdiction: 'Dubai Mainland',
  licenseExpiry: '2028-02-29',
};

function runner(result: { data: unknown; error: { message?: string } | null }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return result;
      },
    },
  };
}

test('company profile update makes one atomic RPC call with actor scope and expected version', async () => {
  const { updateAssignedCompanyProfile } = await import('./company-profile-update');
  const fake = runner({
    data: {
      company_id: input.companyId,
      updated_at: '2026-08-18T10:00:00.000Z',
    },
    error: null,
  });

  const result = await updateAssignedCompanyProfile(input, { client: fake.client as never });

  assert.deepEqual(result, { ok: true, updatedAt: '2026-08-18T10:00:00.000Z' });
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.calls[0], {
    name: 'update_assigned_company_profile',
    args: {
      p_actor_profile_id: input.actorId,
      p_tenant_id: input.tenantId,
      p_company_id: input.companyId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_company_name: input.companyName,
      p_trade_license_no: input.tradeLicenseNo,
      p_jurisdiction: input.jurisdiction,
      p_license_expiry: input.licenseExpiry,
    },
  });
});

test('released assignment and stale version map to stable action outcomes', async () => {
  const { updateAssignedCompanyProfile } = await import('./company-profile-update');
  const cases = [
    ['ASSIGNMENT_NOT_FOUND', { ok: false, code: 'notFound' }],
    ['STALE_COMPANY_PROFILE', { ok: false, code: 'conflict' }],
  ] as const;

  for (const [message, expected] of cases) {
    const fake = runner({ data: null, error: { message } });
    assert.deepEqual(
      await updateAssignedCompanyProfile(input, { client: fake.client as never }),
      expected,
    );
  }
});

test('unknown RPC failures are sanitized and logged without private error details', async () => {
  const { updateAssignedCompanyProfile } = await import('./company-profile-update');
  const diagnostics: string[] = [];
  const fake = runner({ data: null, error: { message: 'private database detail' } });

  const result = await updateAssignedCompanyProfile(input, {
    client: fake.client as never,
    log: (event) => diagnostics.push(event),
  });

  assert.deepEqual(result, { ok: false, code: 'unexpected' });
  assert.deepEqual(diagnostics, ['company-profile.update-rpc failed']);
  assert.doesNotMatch(JSON.stringify(result), /private database detail/);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private database detail/);
});

test('stored update token returned by the RPC becomes the exact next expected version', async () => {
  const { updateAssignedCompanyProfile } = await import('./company-profile-update');
  const storedTokens = ['2026-08-18T10:00:00.123456Z', '2026-08-18T10:00:01.654321Z'];
  const expectedTokens: unknown[] = [];
  const client = {
    async rpc(_name: string, args: Record<string, unknown>) {
      expectedTokens.push(args.p_expected_updated_at);
      return {
        data: { company_id: input.companyId, updated_at: storedTokens[expectedTokens.length - 1] },
        error: null,
      };
    },
  };

  const first = await updateAssignedCompanyProfile(input, { client: client as never });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = await updateAssignedCompanyProfile(
    { ...input, expectedUpdatedAt: first.updatedAt },
    { client: client as never },
  );

  assert.deepEqual(expectedTokens, [input.expectedUpdatedAt, storedTokens[0]]);
  assert.deepEqual(second, { ok: true, updatedAt: storedTokens[1] });
});
