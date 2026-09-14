#!/usr/bin/env tsx
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lookup } from 'node:dns/promises';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  assertLocalAcceptanceIdentitySet,
  assertLocalAcceptanceInfrastructure,
  parseSupabaseStatus,
} from './local-target';
import { generateTotp } from './totp';
import {
  ACCEPTANCE_CONFIG,
  ACCEPTANCE_PROJECT_ID,
  prepareAcceptanceWorkdir,
  removeAcceptanceWorkdir,
  runSupabase,
} from './supabase-cli';

export const FIXTURE_PREFIX = 'P2.12 Local Acceptance';
const PROJECT_ID = ACCEPTANCE_PROJECT_ID;
const FIXTURE_DOMAIN = 'p2-12.local';
const SECRET_PATH = resolve('tests/.auth/p2-credentials.json');

type Role = 'super_admin' | 'pro' | 'customer' | 'employee';
export type RoleSeed = {
  role: Role;
  email: string;
  password: string;
  fullName: string;
  totpSecret?: string;
};

export type FixtureCounts = {
  authUsers: number;
  profiles: number;
  superAdmins: number;
  pros: number;
  customers: number;
  employees: number;
  tenants: number;
  companies: number;
  activeAssignments: number;
  verifiedProCredentials: number;
};

export type RuntimeSecrets = {
  roles: RoleSeed[];
  tenantSlug: string;
  tenantId: string;
  companyId: string;
  encryptionKey: string;
  aliases: Record<string, string>;
};

type ScopedRow = { id: string; tenant_id: string; company_id: string };
export type ReusableFixtureSnapshot = {
  users: Array<{
    id: string;
    email?: string;
    emailConfirmed: boolean;
    appMetadata: Record<string, unknown>;
  }>;
  profiles: Array<{
    id: string;
    role: string;
    status: string;
    tenant_id: string | null;
    mfa_enrolled_at: string | null;
  }>;
  tenant: { id: string; slug: string; status: string };
  company: { id: string; tenant_id: string; status: string };
  assignment: {
    tenant_id: string;
    company_id: string;
    pro_profile_id: string;
    status: string;
  };
  customerProfile: { profile_id: string; linked_company_id: string };
  employee: ScopedRow & { profile_id: string; status: string };
  credential: { pro_profile_id: string; state: string };
  invoice: ScopedRow;
  job: ScopedRow & { kind: string; status: string };
  blogCms: { id: string; slug: string; status: string };
  pageCms: { id: string; slug: string; status: string };
  serviceCase: ScopedRow & { created_by: string };
};

function password(): string {
  return `P2!aZ9-${randomBytes(24).toString('base64url')}`;
}

export function buildRoleSeeds(): RoleSeed[] {
  return (['super_admin', 'pro', 'customer', 'employee'] as const).map((role) => ({
    role,
    email: `${role.replace('super_admin', 'admin')}@${FIXTURE_DOMAIN}`,
    password: password(),
    fullName: `${FIXTURE_PREFIX} ${role.replace('_', ' ')}`,
  }));
}

async function assertSafeSecretParent(parent: string): Promise<void> {
  let metadata;
  try {
    metadata = await lstat(parent);
  } catch {
    fixtureError('secret manifest parent is missing');
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    fixtureError('secret manifest parent must be a real directory');
  if ((metadata.mode & 0o777) !== 0o700) fixtureError('secret manifest parent must have mode 0700');
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid())
    fixtureError('secret manifest parent must be owned by the current user');
}

export async function writeSecretFile(path: string, roles: RoleSeed[]): Promise<string>;
export async function writeSecretFile(path: string, secrets: RuntimeSecrets): Promise<string>;
export async function writeSecretFile(
  path: string,
  value: RoleSeed[] | RuntimeSecrets,
): Promise<string> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await assertSafeSecretParent(parent);
  try {
    await lstat(path);
    fixtureError('secret manifest path already exists');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(
      `${JSON.stringify(Array.isArray(value) ? { roles: value } : value, null, 2)}\n`,
      'utf8',
    );
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporaryPath, path);
    return path;
  } catch {
    fixtureError('secret manifest could not be created safely');
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return fixtureError('secret manifest could not be created safely');
}

const REQUIRED_COUNTS: FixtureCounts = {
  authUsers: 4,
  profiles: 4,
  superAdmins: 1,
  pros: 1,
  customers: 1,
  employees: 1,
  tenants: 1,
  companies: 1,
  activeAssignments: 1,
  verifiedProCredentials: 1,
};

export function assertFixtureCounts(counts: FixtureCounts): void {
  for (const key of Object.keys(REQUIRED_COUNTS) as Array<keyof FixtureCounts>) {
    if (counts[key] !== REQUIRED_COUNTS[key]) {
      throw new Error(`P2_FIXTURE: ${key} must be ${REQUIRED_COUNTS[key]}, got ${counts[key]}`);
    }
  }
}

type FixtureIdentity = { id: string; email?: string };

function fixtureError(message: string): never {
  throw new Error(`P2_FIXTURE: ${message}`);
}

function parseRuntimeSecrets(value: unknown): RuntimeSecrets {
  if (typeof value !== 'object' || value === null) fixtureError('secret manifest is invalid');
  const manifest = value as Partial<RuntimeSecrets>;
  if (!Array.isArray(manifest.roles) || manifest.roles.length !== 4)
    fixtureError('secret manifest roles are incomplete');
  const expectedRoles = ['super_admin', 'pro', 'customer', 'employee'] as const;
  for (const role of expectedRoles) {
    const seed = manifest.roles.find((candidate) => candidate?.role === role);
    const expectedEmail = `${role.replace('super_admin', 'admin')}@${FIXTURE_DOMAIN}`;
    if (
      !seed ||
      seed.email !== expectedEmail ||
      typeof seed.password !== 'string' ||
      seed.password.length < 32 ||
      typeof seed.totpSecret !== 'string' ||
      seed.totpSecret.length === 0
    ) {
      fixtureError(`secret manifest role ${role} is incomplete or mismatched`);
    }
  }
  if (manifest.tenantSlug !== 'p2-12-company') fixtureError('secret manifest tenant mismatched');
  if (
    typeof manifest.tenantId !== 'string' ||
    typeof manifest.companyId !== 'string' ||
    typeof manifest.aliases !== 'object' ||
    manifest.aliases === null ||
    manifest.aliases.company !== manifest.companyId
  ) {
    fixtureError('secret manifest identifiers are incomplete or mismatched');
  }
  const expectedAliases = [
    'company',
    'section',
    'registration',
    'invoice',
    'job',
    'blogCms',
    'pageCms',
    'pro',
    'user',
    'erasure',
    'serviceCase',
  ];
  if (
    Object.keys(manifest.aliases).sort().join(',') !== expectedAliases.sort().join(',') ||
    Object.values(manifest.aliases).some((alias) => typeof alias !== 'string' || alias.length === 0)
  ) {
    fixtureError('secret manifest aliases are incomplete or unexpected');
  }
  if (
    typeof manifest.encryptionKey !== 'string' ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(manifest.encryptionKey) ||
    Buffer.from(manifest.encryptionKey, 'base64').length !== 32
  ) {
    fixtureError('secret manifest encryption key is invalid');
  }
  return manifest as RuntimeSecrets;
}

export async function readReusableFixtureSecrets(path: string): Promise<RuntimeSecrets> {
  await assertSafeSecretParent(dirname(path));
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    fixtureError('reusable secret manifest is missing');
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) fixtureError('reusable secret manifest must be a regular file');
    if ((metadata.mode & 0o777) !== 0o600)
      fixtureError('reusable secret manifest must have mode 0600');
    if (typeof process.getuid === 'function' && metadata.uid !== process.getuid())
      fixtureError('reusable secret manifest must be owned by the current user');
    return parseRuntimeSecrets(JSON.parse(await handle.readFile('utf8')) as unknown);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('P2_FIXTURE:')) throw error;
    fixtureError('reusable secret manifest is unreadable or invalid');
  } finally {
    await handle.close();
  }
}

function assertReusableFixtureIdentities(users: FixtureIdentity[], secrets: RuntimeSecrets): void {
  const manifest = parseRuntimeSecrets(secrets);
  const usersByEmail = new Map(users.map((user) => [user.email, user]));
  if (users.length !== 4 || usersByEmail.size !== 4)
    fixtureError('existing identities do not exactly match the fixture');
  for (const role of manifest.roles) {
    if (!usersByEmail.has(role.email))
      fixtureError('existing identities do not exactly match the fixture');
  }
  if (
    usersByEmail.get(`pro@${FIXTURE_DOMAIN}`)?.id !== manifest.aliases.pro ||
    usersByEmail.get(`employee@${FIXTURE_DOMAIN}`)?.id !== manifest.aliases.user
  ) {
    fixtureError('secret manifest identity aliases do not match the fixture');
  }
}

export function assertReusableFixture(
  counts: FixtureCounts,
  users: FixtureIdentity[],
  secrets: RuntimeSecrets,
): void {
  assertFixtureCounts(counts);
  assertReusableFixtureIdentities(users, secrets);
}

function assertFixture(condition: boolean, message: string): void {
  if (!condition) fixtureError(message);
}

export function assertReusableFixtureSnapshot(
  snapshot: ReusableFixtureSnapshot,
  secrets: RuntimeSecrets,
): void {
  const manifest = parseRuntimeSecrets(secrets);
  const roleIds = new Map(
    manifest.roles.map((role) => [
      role.role,
      snapshot.users.find((user) => user.email === role.email)?.id,
    ]),
  );
  assertFixture(snapshot.users.length === 4, 'auth identity snapshot is not exact');
  assertFixture(snapshot.profiles.length === 4, 'profile snapshot is not exact');
  for (const role of manifest.roles) {
    const id = roleIds.get(role.role);
    const user = snapshot.users.find((candidate) => candidate.id === id);
    const profile = snapshot.profiles.find((candidate) => candidate.id === id);
    const tenantId = role.role === 'super_admin' ? null : manifest.tenantId;
    assertFixture(Boolean(user?.emailConfirmed), `auth identity ${role.role} is unconfirmed`);
    assertFixture(
      user?.appMetadata.mandoob_role === role.role &&
        user.appMetadata.mandoob_status === 'active' &&
        (user.appMetadata.tenant_id ?? null) === tenantId,
      `auth identity ${role.role} metadata mismatched`,
    );
    assertFixture(
      profile?.role === role.role &&
        profile.status === 'active' &&
        profile.tenant_id === tenantId &&
        typeof profile.mfa_enrolled_at === 'string',
      `profile ${role.role} scope mismatched`,
    );
  }
  assertFixture(
    snapshot.tenant.id === manifest.tenantId &&
      snapshot.tenant.slug === manifest.tenantSlug &&
      snapshot.tenant.status === 'active',
    'tenant state mismatched',
  );
  assertFixture(
    snapshot.company.id === manifest.companyId &&
      snapshot.company.tenant_id === manifest.tenantId &&
      snapshot.company.status === 'active',
    'Company state mismatched',
  );
  assertFixture(
    snapshot.assignment.tenant_id === manifest.tenantId &&
      snapshot.assignment.company_id === manifest.companyId &&
      snapshot.assignment.pro_profile_id === manifest.aliases.pro &&
      snapshot.assignment.status === 'active',
    'active assignment mismatched',
  );
  assertFixture(
    snapshot.customerProfile.profile_id === roleIds.get('customer') &&
      snapshot.customerProfile.linked_company_id === manifest.companyId,
    'customer profile mismatched',
  );
  assertFixture(
    snapshot.employee.profile_id === manifest.aliases.user &&
      snapshot.employee.tenant_id === manifest.tenantId &&
      snapshot.employee.company_id === manifest.companyId &&
      snapshot.employee.status === 'active',
    'employee row mismatched',
  );
  assertFixture(
    snapshot.credential.pro_profile_id === manifest.aliases.pro &&
      snapshot.credential.state === 'verified',
    'verified PRO credential mismatched',
  );
  for (const [label, row, alias] of [
    ['invoice', snapshot.invoice, manifest.aliases.invoice],
    ['job', snapshot.job, manifest.aliases.job],
    ['service case', snapshot.serviceCase, manifest.aliases.serviceCase],
  ] as const) {
    assertFixture(
      row.id === alias &&
        row.tenant_id === manifest.tenantId &&
        row.company_id === manifest.companyId,
      `${label} alias mismatched`,
    );
  }
  assertFixture(
    snapshot.job.kind === 'employees' && snapshot.job.status === 'completed',
    'job mismatched',
  );
  assertFixture(
    snapshot.serviceCase.created_by === manifest.aliases.pro,
    'service case actor mismatched',
  );
  assertFixture(
    snapshot.blogCms.id === manifest.aliases.blogCms &&
      snapshot.blogCms.slug === 'p2-12-local-draft' &&
      snapshot.blogCms.status === 'draft',
    'blog alias mismatched',
  );
  assertFixture(
    snapshot.pageCms.id === manifest.aliases.pageCms &&
      snapshot.pageCms.slug === 'p2-12-local-page' &&
      snapshot.pageCms.status === 'draft',
    'page alias mismatched',
  );
  assertFixture(manifest.aliases.company === manifest.companyId, 'Company alias mismatched');
  assertFixture(manifest.aliases.pro === roleIds.get('pro'), 'PRO alias mismatched');
  assertFixture(manifest.aliases.user === roleIds.get('employee'), 'user alias mismatched');
  assertFixture(manifest.aliases.section === 'legal', 'section alias mismatched');
  assertFixture(
    manifest.aliases.registration === '00000000-0000-4000-8000-000000000012',
    'registration route contract mismatched',
  );
  assertFixture(
    manifest.aliases.erasure === '00000000-0000-4000-8000-000000000013',
    'erasure route contract mismatched',
  );
}

export async function runAfterLocalPreflight<T>(
  preflight: () => Promise<unknown>,
  serviceRoleRequest: () => Promise<T>,
): Promise<T> {
  await preflight();
  return serviceRoleRequest();
}

export async function reuseExistingFixture(
  occupied: boolean,
  dependencies: { verify: () => Promise<void>; create: () => Promise<void> },
): Promise<boolean> {
  if (!occupied) {
    await dependencies.create();
    return false;
  }
  await dependencies.verify();
  return true;
}

export async function verifyReusableCredentials(
  roles: RoleSeed[],
  verifyRole: (role: RoleSeed) => Promise<unknown>,
): Promise<void> {
  for (const role of roles) {
    try {
      await verifyRole(role);
    } catch {
      fixtureError(`stored ${role.role} credential or MFA factor is invalid`);
    }
  }
}

function requiredStatusValue(status: Record<string, unknown>, key: string): string {
  const value = status[key];
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`P2_FIXTURE: missing ${key}`);
  return value;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function result<R extends { data: unknown; error: unknown }>(
  value: R,
  label: string,
): NonNullable<R['data']> {
  if (value.error || value.data === null) {
    const message =
      typeof value.error === 'object' && value.error !== null && 'message' in value.error
        ? String(value.error.message)
        : 'no data';
    throw new Error(`P2_FIXTURE: ${label} failed (${message})`);
  }
  return value.data as NonNullable<R['data']>;
}

async function listAllUsers(admin: SupabaseClient) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const response = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (response.error)
      throw new Error(`P2_FIXTURE: list users failed (${response.error.message})`);
    users.push(...response.data.users);
    if (response.data.users.length < 200) return users;
  }
}

async function count(admin: SupabaseClient, table: string, filters: Record<string, string> = {}) {
  let query = admin.from(table).select('*', { count: 'exact', head: true });
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const response = await query;
  if (response.error)
    throw new Error(`P2_FIXTURE: count ${table} failed (${response.error.message})`);
  return response.count ?? 0;
}

async function rows(
  admin: SupabaseClient,
  table: string,
  filters: Record<string, string> = {},
): Promise<Array<Record<string, unknown>>> {
  let query = admin.from(table).select('*');
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const response = await query;
  return result(response, `read ${table}`) as unknown as Array<Record<string, unknown>>;
}

async function exactRow(
  admin: SupabaseClient,
  table: string,
  filters: Record<string, string>,
): Promise<Record<string, unknown>> {
  const matches = await rows(admin, table, filters);
  if (matches.length !== 1) fixtureError(`${table} fixture row is not exact`);
  return matches[0]!;
}

async function rpc(admin: SupabaseClient, name: string, args: Record<string, unknown>) {
  const response = await admin.rpc(name, args);
  return result(response, name) as Record<string, unknown>;
}

async function enrollTotp(apiUrl: string, anonKey: string, role: RoleSeed): Promise<string> {
  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  result(
    await client.auth.signInWithPassword({ email: role.email, password: role.password }),
    'sign in for MFA enrollment',
  );
  const enrollment = result(await client.auth.mfa.enroll({ factorType: 'totp' }), 'MFA enrollment');
  const secret = enrollment.totp.secret;
  result(
    await client.auth.mfa.challengeAndVerify({
      factorId: enrollment.id,
      code: generateTotp(secret),
    }),
    'MFA verification',
  );
  await client.auth.signOut();
  return secret;
}

async function verifyReusableCredential(apiUrl: string, anonKey: string, role: RoleSeed) {
  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    result(
      await client.auth.signInWithPassword({ email: role.email, password: role.password }),
      'fixture credential sign in',
    );
    const factors = result(await client.auth.mfa.listFactors(), 'fixture MFA factor list');
    const verifiedTotp = factors.totp.filter((factor) => factor.status === 'verified');
    if (verifiedTotp.length !== 1)
      fixtureError('fixture must have exactly one verified TOTP factor');
    result(
      await client.auth.mfa.challengeAndVerify({
        factorId: verifiedTotp[0]!.id,
        code: generateTotp(role.totpSecret!),
      }),
      'fixture MFA challenge',
    );
  } finally {
    await client.auth.signOut();
  }
}

async function readReusableFixtureSnapshot(
  admin: SupabaseClient,
  users: Awaited<ReturnType<typeof listAllUsers>>,
  secrets: RuntimeSecrets,
): Promise<ReusableFixtureSnapshot> {
  const adminId = users.find((user) => user.email === `admin@${FIXTURE_DOMAIN}`)!.id;
  const proId = secrets.aliases.pro;
  const credentialSnapshot = await rpc(admin, 'read_pro_credential_snapshot', {
    p_actor_id: adminId,
    p_pro_profile_id: proId,
  });
  const credentials = Array.isArray(credentialSnapshot.credentials)
    ? credentialSnapshot.credentials
    : [];
  const credential = credentials.length === 1 ? credentials[0] : null;
  if (typeof credential !== 'object' || credential === null)
    fixtureError('verified PRO credential snapshot is not exact');

  const [
    profiles,
    tenant,
    company,
    assignment,
    customerProfile,
    employee,
    invoice,
    job,
    blogCms,
    pageCms,
    serviceCase,
  ] = await Promise.all([
    rows(admin, 'profiles'),
    exactRow(admin, 'tenants', { id: secrets.tenantId }),
    exactRow(admin, 'company_profiles', { id: secrets.companyId }),
    exactRow(admin, 'pro_company_assignments', {
      tenant_id: secrets.tenantId,
      company_id: secrets.companyId,
      pro_profile_id: proId,
      status: 'active',
    }),
    exactRow(admin, 'customer_profiles', {
      profile_id: users.find((user) => user.email === `customer@${FIXTURE_DOMAIN}`)!.id,
    }),
    exactRow(admin, 'employees', { profile_id: secrets.aliases.user }),
    exactRow(admin, 'invoices', { id: secrets.aliases.invoice }),
    exactRow(admin, 'bulk_import_jobs', { id: secrets.aliases.job }),
    exactRow(admin, 'blog_posts', { id: secrets.aliases.blogCms }),
    exactRow(admin, 'cms_pages', { id: secrets.aliases.pageCms }),
    exactRow(admin, 'service_cases', { id: secrets.aliases.serviceCase }),
  ]);
  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      emailConfirmed: typeof user.email_confirmed_at === 'string',
      appMetadata: user.app_metadata,
    })),
    profiles,
    tenant,
    company,
    assignment,
    customerProfile,
    employee,
    credential: { pro_profile_id: proId, state: credential.state },
    invoice,
    job,
    blogCms,
    pageCms,
    serviceCase,
  } as unknown as ReusableFixtureSnapshot;
}

async function verifyFixture(admin: SupabaseClient, roles: RoleSeed[]): Promise<FixtureCounts> {
  const users = await listAllUsers(admin);
  const pro = roles.find((role) => role.role === 'pro')!;
  const proUser = users.find((user) => user.email === pro.email)!;
  const snapshot = await rpc(admin, 'read_pro_credential_snapshot', {
    p_actor_id: users.find((user) => user.email === 'admin@p2-12.local')!.id,
    p_pro_profile_id: proUser.id,
  });
  const credentials = Array.isArray(snapshot.credentials) ? snapshot.credentials : [];
  return {
    authUsers: users.length,
    profiles: await count(admin, 'profiles'),
    superAdmins: await count(admin, 'profiles', { role: 'super_admin' }),
    pros: await count(admin, 'profiles', { role: 'pro' }),
    customers: await count(admin, 'profiles', { role: 'customer' }),
    employees: await count(admin, 'profiles', { role: 'employee' }),
    tenants: await count(admin, 'tenants'),
    companies: await count(admin, 'company_profiles'),
    activeAssignments: await count(admin, 'pro_company_assignments', { status: 'active' }),
    verifiedProCredentials: credentials.filter(
      (credential) =>
        typeof credential === 'object' && credential !== null && credential.state === 'verified',
    ).length,
  };
}

async function main() {
  const action = process.argv[2] ?? 'setup';
  if (!['setup', 'verify', 'teardown'].includes(action))
    throw new Error('P2_FIXTURE: expected setup, verify, or teardown');
  await prepareAcceptanceWorkdir();
  if (action === 'setup') runSupabase(['start']);
  const status = parseSupabaseStatus(runSupabase(['status', '-o', 'json']));
  const apiUrl = requiredStatusValue(status, 'API_URL');
  const dbUrl = requiredStatusValue(status, 'DB_URL');
  const storageUrl = requiredStatusValue(status, 'STORAGE_S3_URL');
  const serviceKey = requiredStatusValue(status, 'SERVICE_ROLE_KEY');
  const anonKey = requiredStatusValue(status, 'ANON_KEY');
  const config = await readFile(ACCEPTANCE_CONFIG, 'utf8');
  const actualProjectId = /^project_id\s*=\s*"([^"]+)"/mu.exec(config)?.[1] ?? '';
  const { admin, existingUsers } = await runAfterLocalPreflight(
    () =>
      assertLocalAcceptanceInfrastructure({
        env: {
          P2_ACCEPTANCE_LOCAL_ONLY: process.env.P2_ACCEPTANCE_LOCAL_ONLY,
          NEXT_PUBLIC_SUPABASE_URL: apiUrl,
          SUPABASE_DB_URL: dbUrl,
          SUPABASE_STORAGE_URL: storageUrl,
          SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        },
        expectedProjectId: PROJECT_ID,
        actualProjectId,
        status,
        resolveHost: async (host) =>
          (await lookup(host, { all: true })).map(({ address }) => address),
      }),
    async () => {
      const guardedAdmin = createClient(apiUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return { admin: guardedAdmin, existingUsers: await listAllUsers(guardedAdmin) };
    },
  );
  const unexpected = existingUsers.filter((user) => !user.email?.endsWith(`@${FIXTURE_DOMAIN}`));
  assertLocalAcceptanceIdentitySet(unexpected.length);

  if (action === 'teardown') {
    const secrets = await readReusableFixtureSecrets(SECRET_PATH);
    assertReusableFixture(await verifyFixture(admin, secrets.roles), existingUsers, secrets);
    assertReusableFixtureSnapshot(
      await readReusableFixtureSnapshot(admin, existingUsers, secrets),
      secrets,
    );
    runSupabase(['stop', '--no-backup']);
    for (const file of [
      SECRET_PATH,
      ...(['admin', 'pro', 'customer', 'employee'] as const).map((role) =>
        resolve(`tests/.auth/${role}.json`),
      ),
    ]) {
      await unlink(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    await removeAcceptanceWorkdir();
    process.stdout.write(
      'P2 fixture teardown verified: identities, Company data, and secret artifacts removed.\n',
    );
    return;
  }

  if (action === 'verify') {
    const roles = buildRoleSeeds().map((role) => ({
      ...role,
      password: '',
    }));
    assertFixtureCounts(await verifyFixture(admin, roles));
    process.stdout.write(
      'P2 fixture verified: exact role, Company, assignment, and credential invariants pass.\n',
    );
    return;
  }
  const existingTenantCount = await count(admin, 'tenants');
  const reused = await reuseExistingFixture(
    existingUsers.length !== 0 || existingTenantCount !== 0,
    {
      verify: async () => {
        const secrets = await readReusableFixtureSecrets(SECRET_PATH);
        assertReusableFixtureIdentities(existingUsers, secrets);
        assertReusableFixture(await verifyFixture(admin, secrets.roles), existingUsers, secrets);
        assertReusableFixtureSnapshot(
          await readReusableFixtureSnapshot(admin, existingUsers, secrets),
          secrets,
        );
        await verifyReusableCredentials(secrets.roles, (role) =>
          verifyReusableCredential(apiUrl, anonKey, role),
        );
      },
      create: async () => undefined,
    },
  );
  if (reused) {
    process.stdout.write(
      'P2 fixture reused after exact database, manifest, and login verification.\n',
    );
    return;
  }

  const roles = buildRoleSeeds();
  const ids = new Map<Role, string>();
  for (const role of roles) {
    const created = result(
      await admin.auth.admin.createUser({
        email: role.email,
        password: role.password,
        email_confirm: true,
        user_metadata: { full_name: role.fullName },
        app_metadata: { mandoob_role: role.role, tenant_id: null, mandoob_status: 'active' },
      }),
      `create ${role.role}`,
    );
    if (!created.user) throw new Error(`P2_FIXTURE: create ${role.role} returned no user`);
    ids.set(role.role, created.user.id);
    if (role.role === 'super_admin' || role.role === 'pro') {
      result(
        await admin
          .from('profiles')
          .insert({
            id: created.user.id,
            role: role.role,
            status: 'active',
            full_name: role.fullName,
            consent_accepted_at: new Date().toISOString(),
            policy_version: 'p2-12-local',
          })
          .select('id')
          .single(),
        `profile ${role.role}`,
      );
    }
  }

  const adminId = ids.get('super_admin')!;
  const proId = ids.get('pro')!;
  result(
    await admin
      .from('pro_profiles')
      .insert({ profile_id: proId, designation: 'Licensed PRO' })
      .select('profile_id')
      .single(),
    'PRO profile',
  );

  const credential = await rpc(admin, 'create_pro_credential_draft', {
    p_actor_id: adminId,
    p_pro_profile_id: proId,
    p_operation_id: randomUUID(),
    p_payload_hash: digest('create credential'),
  });
  const credentialId = String(credential.credentialId);
  await rpc(admin, 'save_pro_credential_draft', {
    p_actor_id: adminId,
    p_credential_id: credentialId,
    p_expected_version: 0,
    p_operation_id: randomUUID(),
    p_payload_hash: digest('save credential'),
    p_preserve_identifier: false,
    p_identifier_ciphertext: 'p2-local-ciphertext',
    p_identifier_hash: digest('P2LOCAL1234'),
    p_identifier_last4: '1234',
    p_issuing_authority: 'Dubai Economy and Tourism',
    p_issue_date: '2026-01-01',
    p_expiry_date: '2028-12-31',
  });
  const evidenceId = randomUUID();
  const evidenceArgs = {
    p_actor_id: adminId,
    p_credential_id: credentialId,
    p_expected_version: 1,
    p_operation_id: evidenceId,
    p_payload_hash: digest('register evidence'),
    p_evidence_id: evidenceId,
    p_storage_path: `pro-credentials/${proId}/${credentialId}/${evidenceId}`,
    p_mime_type: 'application/pdf',
    p_size_bytes: 64,
    p_sha256: digest('fixture evidence'),
    p_original_name_safe: 'p2-local-license.pdf',
    p_scan_provider: 'p2-local-fixture',
    p_scan_completed_at: new Date().toISOString(),
  };
  await rpc(admin, 'prepare_pro_credential_evidence_upload', evidenceArgs);
  await rpc(admin, 'finalize_pro_credential_evidence_upload', evidenceArgs);
  for (const [name, version] of [
    ['submit_pro_credential', 2],
    ['begin_pro_credential_review', 3],
    ['verify_pro_credential', 4],
  ] as const) {
    await rpc(admin, name, {
      p_actor_id: adminId,
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
    const term = await rpc(admin, 'create_pro_commercial_term_draft', {
      p_actor_id: adminId,
      p_pro_profile_id: proId,
      p_operation_id: randomUUID(),
      p_payload_hash: digest(termKind),
      p_term_kind: termKind,
      p_model: 'per_registration',
      p_amount_minor: amountMinor,
      p_retainer_interval: null,
      p_effective_from: '2026-01-01',
      p_effective_to: null,
    });
    await rpc(admin, 'activate_pro_commercial_term', {
      p_actor_id: adminId,
      p_term_id: term.termId,
      p_expected_version: 1,
      p_operation_id: randomUUID(),
      p_payload_hash: digest(`activate ${termKind}`),
    });
  }

  const company = await rpc(admin, 'provision_company_workspace_atomic', {
    p_actor_id: adminId,
    p_company_name: `${FIXTURE_PREFIX} Company`,
    p_slug: 'p2-12-company',
    p_plan: 'professional',
  });
  const tenantId = String(company.tenant_id);
  const companyId = String(company.company_id);
  result(
    await admin
      .from('tenants')
      .update({ status: 'active' })
      .eq('id', tenantId)
      .select('id')
      .single(),
    'activate tenant',
  );
  result(
    await admin
      .from('company_profiles')
      .update({ status: 'active' })
      .eq('id', companyId)
      .select('id')
      .single(),
    'activate company',
  );
  await rpc(admin, 'assign_pro_to_company_with_context', {
    p_company_id: companyId,
    p_pro_profile_id: proId,
    p_actor_profile_id: adminId,
  });

  for (const role of ['customer', 'employee'] as const) {
    const id = ids.get(role)!;
    const seed = roles.find((candidate) => candidate.role === role)!;
    result(
      await admin
        .from('profiles')
        .insert({
          id,
          tenant_id: tenantId,
          role,
          status: 'active',
          full_name: seed.fullName,
          consent_accepted_at: new Date().toISOString(),
          policy_version: 'p2-12-local',
        })
        .select('id')
        .single(),
      `profile ${role}`,
    );
    result(
      await admin.auth.admin.updateUserById(id, {
        app_metadata: { mandoob_role: role, tenant_id: tenantId, mandoob_status: 'active' },
      }),
      `auth scope ${role}`,
    );
  }
  const customerId = ids.get('customer')!;
  const employeeProfileId = ids.get('employee')!;
  result(
    await admin
      .from('customer_profiles')
      .insert({ profile_id: customerId, linked_company_id: companyId, nationality: 'AE' })
      .select('profile_id')
      .single(),
    'customer profile',
  );
  const employee = result(
    await admin
      .from('employees')
      .insert({
        profile_id: employeeProfileId,
        tenant_id: tenantId,
        company_id: companyId,
        name: `${FIXTURE_PREFIX} Employee`,
        email: 'employee@p2-12.local',
        nationality: 'AE',
        status: 'active',
        visa_expiry: '2027-03-31',
        eid_expiry: '2027-06-30',
      })
      .select('id')
      .single(),
    'employee record',
  );

  const serviceCase = result(
    await admin
      .from('service_cases')
      .insert({
        tenant_id: tenantId,
        company_id: companyId,
        created_by: proId,
        assigned_to: proId,
        title: `${FIXTURE_PREFIX} Trade licence renewal`,
        service_type: 'license_renewal',
        priority: 'high',
        status: 'documents_pending',
        due_at: '2026-10-15T08:00:00Z',
        sla_due_at: '2026-09-30T08:00:00Z',
      })
      .select('id')
      .single(),
    'service case',
  );
  result(
    await admin
      .from('document_requests')
      .insert({
        tenant_id: tenantId,
        company_id: companyId,
        employee_id: employee.id,
        requested_by: proId,
        doc_type: 'passport',
        label: `${FIXTURE_PREFIX} Passport copy`,
        status: 'pending',
        due_at: '2026-09-30T08:00:00Z',
      })
      .select('id')
      .single(),
    'document request',
  );
  result(
    await admin
      .from('renewals')
      .insert({
        tenant_id: tenantId,
        company_id: companyId,
        employee_id: employee.id,
        label: `${FIXTURE_PREFIX} Visa`,
        type: 'visa',
        source: 'manual',
        status: 'upcoming',
        due_date: '2027-03-31',
      })
      .select('id')
      .single(),
    'renewal',
  );
  const invoice = result(
    await admin
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        company_id: companyId,
        customer_profile_id: customerId,
        created_by: proId,
        label: `${FIXTURE_PREFIX} Service invoice`,
        amount_minor: 250000,
        currency: 'AED',
        status: 'open',
        due_at: '2026-10-15T08:00:00Z',
      })
      .select('id')
      .single(),
    'invoice',
  );
  const importJob = result(
    await admin
      .from('bulk_import_jobs')
      .insert({
        tenant_id: tenantId,
        company_id: companyId,
        created_by: proId,
        kind: 'employees',
        storage_path: `bulk-imports/${tenantId}/p2-12.csv`,
        status: 'completed',
        total_rows: 1,
        processed_rows: 1,
        error_rows: 0,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
    'bulk import',
  );
  const blog = result(
    await admin
      .from('blog_posts')
      .insert({
        slug: 'p2-12-local-draft',
        title: `${FIXTURE_PREFIX} Blog Draft`,
        status: 'draft',
        content_html: '<p>Synthetic local acceptance draft.</p>',
        content_json: { type: 'doc', content: [] },
        created_by: adminId,
        updated_by: adminId,
      })
      .select('id')
      .single(),
    'blog draft',
  );
  const cmsPage = result(
    await admin
      .from('cms_pages')
      .insert({
        slug: 'p2-12-local-page',
        title: `${FIXTURE_PREFIX} Page Draft`,
        status: 'draft',
        content_html: '<p>Synthetic local acceptance page.</p>',
        content_json: { type: 'doc', content: [] },
        hero_settings: {
          backgroundColor: '#ffffff',
          overlayColor: '#000000',
          overlayOpacity: 0,
          headingAlignment: 'center',
          textAlignment: 'center',
          buttonAlignment: 'center',
        },
        created_by: adminId,
        updated_by: adminId,
      })
      .select('id')
      .single(),
    'CMS page draft',
  );

  for (const role of roles) {
    role.totpSecret = await enrollTotp(apiUrl, anonKey, role);
    result(
      await admin
        .from('profiles')
        .update({ mfa_enrolled_at: new Date().toISOString() })
        .eq('id', ids.get(role.role)!)
        .select('id')
        .single(),
      `MFA marker ${role.role}`,
    );
  }
  const secrets: RuntimeSecrets = {
    roles,
    tenantSlug: 'p2-12-company',
    tenantId,
    companyId,
    encryptionKey: randomBytes(32).toString('base64'),
    aliases: {
      company: companyId,
      section: 'legal',
      registration: '00000000-0000-4000-8000-000000000012',
      invoice: invoice.id,
      job: importJob.id,
      blogCms: blog.id,
      pageCms: cmsPage.id,
      pro: proId,
      user: employeeProfileId,
      erasure: '00000000-0000-4000-8000-000000000013',
      serviceCase: serviceCase.id,
    },
  };
  await writeSecretFile(SECRET_PATH, secrets);
  assertFixtureCounts(await verifyFixture(admin, roles));
  process.stdout.write(
    'P2 fixture created and verified: 4 identities, 1 Company, 1 assignment, 1 verified credential.\n',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown fixture failure';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
