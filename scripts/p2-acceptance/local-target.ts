import { isIP } from 'node:net';

export type SupabaseStatus = Record<string, unknown>;

type GuardInput = {
  env: Record<string, string | undefined>;
  expectedProjectId: string;
  actualProjectId: string;
  status: SupabaseStatus;
  resolveHost: (hostname: string) => Promise<ReadonlyArray<string>>;
  unexpectedIdentityCount: number;
};

type InfrastructureGuardInput = Omit<GuardInput, 'unexpectedIdentityCount'>;

type GuardResult = {
  apiOrigin: string;
  databaseHost: string;
  storageOrigin: string;
  projectId: string;
};

function reject(reason: string): never {
  throw new Error(`P2_LOCAL_GUARD: ${reason}`);
}

function readUrl(value: string | undefined, label: string): URL {
  if (!value) reject(`${label} is missing`);
  try {
    return new URL(value);
  } catch {
    return reject(`${label} is invalid`);
  }
}

function isLoopbackAddress(address: string): boolean {
  if (address === '::1') return true;
  if (isIP(address) === 4) return address.startsWith('127.');
  if (isIP(address) === 6) return address.toLowerCase() === '0:0:0:0:0:0:0:1';
  return false;
}

async function requireLoopback(url: URL, label: string, resolveHost: GuardInput['resolveHost']) {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || isLoopbackAddress(hostname)) return;
  const addresses = await resolveHost(hostname);
  if (addresses.length === 0 || addresses.some((address) => !isLoopbackAddress(address))) {
    reject(`${label} is not loopback-only`);
  }
}

function statusUrl(status: SupabaseStatus, key: string): URL {
  const value = status[key];
  if (typeof value !== 'string') reject(`local Supabase status is missing ${key}`);
  return readUrl(value, `status ${key}`);
}

export function parseSupabaseStatus(raw: string): SupabaseStatus {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return reject('local Supabase status is invalid');
    }
    return parsed as SupabaseStatus;
  } catch {
    return reject('local Supabase status is invalid');
  }
}

export function assertLocalAcceptanceIdentitySet(unexpectedIdentityCount: number): void {
  if (!Number.isSafeInteger(unexpectedIdentityCount) || unexpectedIdentityCount !== 0) {
    reject('database contains a non-fixture identity');
  }
}

export async function assertLocalAcceptanceInfrastructure(
  input: InfrastructureGuardInput,
): Promise<GuardResult> {
  if (input.env.P2_ACCEPTANCE_LOCAL_ONLY !== '1') reject('explicit local-only opt-in is required');
  if (!input.env.SUPABASE_SERVICE_ROLE_KEY) reject('service-role credential is missing');
  if (!input.expectedProjectId || input.actualProjectId !== input.expectedProjectId) {
    reject('local Supabase project identity does not match');
  }

  const api = readUrl(input.env.NEXT_PUBLIC_SUPABASE_URL, 'Supabase API URL');
  const database = readUrl(input.env.SUPABASE_DB_URL, 'Supabase database URL');
  const storage = readUrl(input.env.SUPABASE_STORAGE_URL, 'Supabase storage URL');
  await Promise.all([
    requireLoopback(api, 'Supabase API URL', input.resolveHost),
    requireLoopback(database, 'Supabase database URL', input.resolveHost),
    requireLoopback(storage, 'Supabase storage URL', input.resolveHost),
  ]);

  const runningApi = statusUrl(input.status, 'API_URL');
  const runningDatabase = statusUrl(input.status, 'DB_URL');
  const runningStorage = statusUrl(input.status, 'STORAGE_S3_URL');
  await Promise.all([
    requireLoopback(runningApi, 'status API URL', input.resolveHost),
    requireLoopback(runningDatabase, 'status database URL', input.resolveHost),
    requireLoopback(runningStorage, 'status storage URL', input.resolveHost),
  ]);

  if (api.origin !== runningApi.origin) reject('API endpoint does not match local status');
  if (database.hostname !== runningDatabase.hostname || database.port !== runningDatabase.port) {
    reject('database endpoint does not match local status');
  }
  if (storage.protocol !== runningStorage.protocol || storage.port !== runningStorage.port) {
    reject('storage endpoint does not match local status');
  }

  return {
    apiOrigin: api.origin,
    databaseHost: database.hostname,
    storageOrigin: storage.origin,
    projectId: input.actualProjectId,
  };
}

export async function assertLocalAcceptanceTarget(input: GuardInput): Promise<GuardResult> {
  const result = await assertLocalAcceptanceInfrastructure(input);
  assertLocalAcceptanceIdentitySet(input.unexpectedIdentityCount);
  return result;
}
