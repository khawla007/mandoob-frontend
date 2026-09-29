/**
 * P3.08 four-role browser fixture for an isolated LOCAL Supabase stack only.
 *
 *   npx tsx supabase/tests/p308_browser_fixture.ts <secrets-output.json>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / keys from .env.local and refuses any
 * non-loopback URL. Seeds super_admin, PRO (verified credential + active
 * assignment), customer and employee identities with TOTP for privileged
 * roles, plus one company-level renewal created through the P3.08 RPC.
 * Secrets (passwords, TOTP seeds) are written only to the given path.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateTotp } from '../../scripts/p2-acceptance/totp';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(url ?? '')) throw new Error('P308_FIXTURE_LOCAL_ONLY');
const output = process.argv[2];
if (!output) throw new Error('P308_FIXTURE_OUTPUT_REQUIRED');

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = randomBytes(3).toString('hex');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const password = () => `P308!aZ9-${randomBytes(18).toString('base64url')}`;

function ok<R extends { data: unknown; error: unknown }>(
  response: R,
  label: string,
): NonNullable<R['data']> {
  if (response.error) throw new Error(`${label}: ${JSON.stringify(response.error)}`);
  return response.data as NonNullable<R['data']>;
}
async function rpc(name: string, args: Record<string, unknown>) {
  return ok(await admin.rpc(name, args), name) as Record<string, unknown>;
}

type Seed = { role: string; email: string; password: string; id?: string; totp?: string };
const seeds: Seed[] = ['admin', 'pro', 'customer', 'employee'].map((role) => ({
  role,
  email: `${role}-${run}@p308.local`,
  password: password(),
}));

async function enrollTotp(seed: Seed): Promise<string> {
  const client: SupabaseClient = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  ok(
    await client.auth.signInWithPassword({ email: seed.email, password: seed.password }),
    'sign in',
  );
  const enrollment = ok(await client.auth.mfa.enroll({ factorType: 'totp' }), 'enroll');
  ok(
    await client.auth.mfa.challengeAndVerify({
      factorId: enrollment.id,
      code: generateTotp(enrollment.totp.secret),
    }),
    'verify totp',
  );
  await client.auth.signOut();
  return enrollment.totp.secret;
}

async function main() {
  for (const seed of seeds) {
    const created = ok(
      await admin.auth.admin.createUser({
        email: seed.email,
        password: seed.password,
        email_confirm: true,
        app_metadata: { mandoob_role: seed.role, tenant_id: null, mandoob_status: 'active' },
      }),
      `create ${seed.role}`,
    );
    seed.id = created.user!.id;
    if (seed.role === 'admin' || seed.role === 'pro') {
      ok(
        await admin.from('profiles').insert({
          id: seed.id,
          role: seed.role,
          status: 'active',
          full_name: `P3.08 ${seed.role}`,
          consent_accepted_at: new Date().toISOString(),
          policy_version: 'p3-08-local',
        }),
        `profile ${seed.role}`,
      );
    }
  }
  const [adminSeed, proSeed, customerSeed, employeeSeed] = seeds;
  ok(
    await admin
      .from('pro_profiles')
      .insert({ profile_id: proSeed.id, designation: 'Licensed PRO' }),
    'pro profile',
  );
  const credential = await rpc('create_pro_credential_draft', {
    p_actor_id: adminSeed.id,
    p_pro_profile_id: proSeed.id,
    p_operation_id: randomUUID(),
    p_payload_hash: digest('create credential'),
  });
  const credentialId = String(credential.credentialId);
  await rpc('save_pro_credential_draft', {
    p_actor_id: adminSeed.id,
    p_credential_id: credentialId,
    p_expected_version: 0,
    p_operation_id: randomUUID(),
    p_payload_hash: digest('save credential'),
    p_preserve_identifier: false,
    p_identifier_ciphertext: 'p308-local-ciphertext',
    p_identifier_hash: digest(`P308LOCAL${run}`),
    p_identifier_last4: '3080',
    p_issuing_authority: 'Dubai Economy and Tourism',
    p_issue_date: '2026-01-01',
    p_expiry_date: '2028-12-31',
  });
  const evidenceId = randomUUID();
  const evidenceArgs = {
    p_actor_id: adminSeed.id,
    p_credential_id: credentialId,
    p_expected_version: 1,
    p_operation_id: evidenceId,
    p_payload_hash: digest('register evidence'),
    p_evidence_id: evidenceId,
    p_storage_path: `pro-credentials/${proSeed.id}/${credentialId}/${evidenceId}`,
    p_mime_type: 'application/pdf',
    p_size_bytes: 64,
    p_sha256: digest('fixture evidence'),
    p_original_name_safe: 'p308-local-license.pdf',
    p_scan_provider: 'p308-local-fixture',
    p_scan_completed_at: new Date().toISOString(),
  };
  await rpc('prepare_pro_credential_evidence_upload', evidenceArgs);
  await rpc('finalize_pro_credential_evidence_upload', evidenceArgs);
  for (const [name, version] of [
    ['submit_pro_credential', 2],
    ['begin_pro_credential_review', 3],
    ['verify_pro_credential', 4],
  ] as const) {
    await rpc(name, {
      p_actor_id: adminSeed.id,
      p_credential_id: credentialId,
      p_expected_version: version,
      p_operation_id: randomUUID(),
      p_payload_hash: digest(name),
    });
  }
  for (const [termKind, amountMinor] of [
    ['pricing', 250000],
    ['compensation', 75000],
  ] as const) {
    const term = await rpc('create_pro_commercial_term_draft', {
      p_actor_id: adminSeed.id,
      p_pro_profile_id: proSeed.id,
      p_operation_id: randomUUID(),
      p_payload_hash: digest(termKind),
      p_term_kind: termKind,
      p_model: 'per_registration',
      p_amount_minor: amountMinor,
      p_retainer_interval: null,
      p_effective_from: '2026-01-01',
      p_effective_to: null,
    });
    await rpc('activate_pro_commercial_term', {
      p_actor_id: adminSeed.id,
      p_term_id: term.termId,
      p_expected_version: 1,
      p_operation_id: randomUUID(),
      p_payload_hash: digest(`activate ${termKind}`),
    });
  }
  const slug = `p308-${run}`;
  const company = await rpc('provision_company_workspace_atomic', {
    p_actor_id: adminSeed.id,
    p_company_name: `P3.08 Local Company ${run}`,
    p_slug: slug,
    p_plan: 'professional',
  });
  const tenantId = String(company.tenant_id);
  const companyId = String(company.company_id);
  ok(
    await admin.from('tenants').update({ status: 'active' }).eq('id', tenantId),
    'activate tenant',
  );
  ok(
    await admin.from('company_profiles').update({ status: 'active' }).eq('id', companyId),
    'activate company',
  );
  await rpc('assign_pro_to_company_with_context', {
    p_company_id: companyId,
    p_pro_profile_id: proSeed.id,
    p_actor_profile_id: adminSeed.id,
  });
  for (const seed of [customerSeed, employeeSeed]) {
    ok(
      await admin.from('profiles').insert({
        id: seed.id,
        tenant_id: tenantId,
        role: seed.role,
        status: 'active',
        full_name: `P3.08 ${seed.role}`,
        consent_accepted_at: new Date().toISOString(),
        policy_version: 'p3-08-local',
      }),
      `profile ${seed.role}`,
    );
    ok(
      await admin.auth.admin.updateUserById(seed.id!, {
        app_metadata: { mandoob_role: seed.role, tenant_id: tenantId, mandoob_status: 'active' },
      }),
      `auth scope ${seed.role}`,
    );
  }
  ok(
    await admin
      .from('customer_profiles')
      .insert({ profile_id: customerSeed.id, linked_company_id: companyId }),
    'customer profile',
  );
  const employee = ok(
    await admin
      .from('employees')
      .insert({
        profile_id: employeeSeed.id,
        tenant_id: tenantId,
        company_id: companyId,
        name: 'P3.08 Self Employee',
        nationality: 'AE',
        status: 'active',
        visa_expiry: '2027-03-31',
        eid_expiry: '2027-06-30',
      })
      .select('id')
      .single(),
    'employee',
  );
  for (const seed of [adminSeed, proSeed]) {
    seed.totp = await enrollTotp(seed);
    ok(
      await admin
        .from('profiles')
        .update({ mfa_enrolled_at: new Date().toISOString() })
        .eq('id', seed.id!),
      'mfa marker',
    );
  }
  writeFileSync(
    output,
    JSON.stringify({ slug, tenantId, companyId, employeeId: employee.id, roles: seeds }, null, 2),
    { mode: 0o600 },
  );
  process.stdout.write(`P308 fixture ready: tenant ${slug}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'fixture failed'}\n`);
  process.exitCode = 1;
});
