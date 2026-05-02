#!/usr/bin/env tsx
/**
 * Seed Supabase Auth with Mandoob demo users — 2 per PRD role × 2 tenants.
 *
 * Tenants:
 *   - firm  (id 00000000-0000-0000-0000-000000000001, pre-existing)
 *   - nova  (created by this script if missing)
 *
 * Users:
 *   super_admin: khawla@fanaticcoders.com, admin-ops@mandoob.local
 *   pro:         pro-admin@firm.mandoob.local, pro-admin@nova.mandoob.local
 *   customer:    customer@firm.mandoob.local, customer@nova.mandoob.local
 *   employee:    employee@firm.mandoob.local, employee@nova.mandoob.local
 *
 * Usage (from frontend/):
 *   SEED_PASSWORD=... npx tsx scripts/seed-auth.ts
 *
 * Idempotent: users that already exist have app_metadata + profile refreshed.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!password) {
  console.error('Missing SEED_PASSWORD');
  process.exit(1);
}

const TENANT_FIRM_ID = '00000000-0000-0000-0000-000000000001';

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Role = 'super_admin' | 'pro' | 'customer' | 'employee';
type Seed = {
  email: string;
  role: Role;
  tenantSlug: string | null; // resolved to id at seed time
  fullName: string;
};

const seeds: Seed[] = [
  // super admins — not tenant-scoped
  {
    email: 'khawla@fanaticcoders.com',
    role: 'super_admin',
    tenantSlug: null,
    fullName: 'Khawla (Super Admin)',
  },
  {
    email: 'admin-ops@mandoob.local',
    role: 'super_admin',
    tenantSlug: null,
    fullName: 'Ops Admin',
  },
  // pros
  {
    email: 'pro-admin@firm.mandoob.local',
    role: 'pro',
    tenantSlug: 'firm',
    fullName: 'Firm PRO Admin',
  },
  {
    email: 'pro-admin@nova.mandoob.local',
    role: 'pro',
    tenantSlug: 'nova',
    fullName: 'Nova PRO Admin',
  },
  // customers
  {
    email: 'customer@firm.mandoob.local',
    role: 'customer',
    tenantSlug: 'firm',
    fullName: 'Firm Customer',
  },
  {
    email: 'customer@nova.mandoob.local',
    role: 'customer',
    tenantSlug: 'nova',
    fullName: 'Nova Customer',
  },
  // employees
  {
    email: 'employee@firm.mandoob.local',
    role: 'employee',
    tenantSlug: 'firm',
    fullName: 'Firm Employee',
  },
  {
    email: 'employee@nova.mandoob.local',
    role: 'employee',
    tenantSlug: 'nova',
    fullName: 'Nova Employee',
  },
];

async function ensureTenant(slug: string, name: string): Promise<string> {
  const { data: existing } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await admin
    .from('tenants')
    .insert({ slug, name, plan: 'starter', status: 'active' })
    .select('id')
    .single();
  if (error || !created) throw new Error(`failed to create tenant ${slug}: ${error?.message}`);
  console.log(`  created tenant ${slug} (${created.id})`);
  return created.id as string;
}

async function findExisting(email: string): Promise<string | null> {
  // Paginate listUsers — page size 1000 covers dev; prod seed is just for data demos.
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function upsertUser(seed: Seed, tenantId: string | null) {
  let userId = await findExisting(seed.email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: seed.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: seed.fullName },
      app_metadata: {
        mandoob_role: seed.role,
        tenant_id: tenantId,
        mandoob_status: 'active',
      },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`  created ${seed.email} (${userId}) role=${seed.role}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        mandoob_role: seed.role,
        tenant_id: tenantId,
        mandoob_status: 'active',
      },
    });
    if (error) throw error;
    console.log(`  refreshed ${seed.email} (${userId}) role=${seed.role}`);
  }

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: userId,
      tenant_id: tenantId,
      role: seed.role,
      status: 'active',
      full_name: seed.fullName,
      consent_accepted_at: new Date().toISOString(),
      policy_version: 'v1',
    },
    { onConflict: 'id' },
  );
  if (profileError) throw profileError;
}

async function main() {
  console.log('Ensuring tenants…');
  const firmId = TENANT_FIRM_ID;
  // ensure firm exists (created by migration/seed.sql already but idempotent).
  await admin
    .from('tenants')
    .upsert(
      { id: firmId, slug: 'firm', name: 'Fanatic PRO Firm', plan: 'starter', status: 'active' },
      { onConflict: 'id' },
    )
    .throwOnError();
  const novaId = await ensureTenant('nova', 'Nova PRO Agency');

  const tenantIdBySlug: Record<string, string> = { firm: firmId, nova: novaId };

  for (const seed of seeds) {
    console.log(`Seeding ${seed.email}`);
    const tenantId = seed.tenantSlug ? tenantIdBySlug[seed.tenantSlug] : null;
    await upsertUser(seed, tenantId ?? null);
  }
  console.log(
    `\nDone. ${seeds.length} users across ${Object.keys(tenantIdBySlug).length} tenants.`,
  );
  console.log('Shared password: (from $SEED_PASSWORD)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
