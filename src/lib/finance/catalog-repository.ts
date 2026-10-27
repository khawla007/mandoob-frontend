import 'server-only';
import { createHash } from 'node:crypto';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type RpcResult =
  | { ok: true; versionId: string; replayed: boolean }
  | { ok: false; code: 'ACTIVE_IMMUTABLE' | 'EFFECTIVE_OVERLAP' | 'CONFLICT' | 'UNAVAILABLE' };
type CommandBase = { actorId: string; operationId: string; reviewReference: string };
type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function failure(error: unknown): RpcResult {
  const message =
    error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message.includes('ACTIVE_IMMUTABLE')) return { ok: false, code: 'ACTIVE_IMMUTABLE' };
  if (message.includes('EFFECTIVE_OVERLAP')) return { ok: false, code: 'EFFECTIVE_OVERLAP' };
  if (message.includes('STALE_VERSION') || message.includes('OPERATION_REUSED'))
    return { ok: false, code: 'CONFLICT' };
  return { ok: false, code: 'UNAVAILABLE' };
}
async function rpc(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) return failure(error);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return row && typeof row.version_id === 'string'
    ? { ok: true, versionId: row.version_id, replayed: Boolean(row.replayed) }
    : { ok: false, code: 'UNAVAILABLE' };
}

export const cloneCatalog = (
  input: CommandBase & { sourceVersionId: string; catalogKey: string; label: string },
  client = createSupabaseServiceRoleClient(),
) =>
  rpc(client, 'p309_clone_subscription_catalog', {
    p_actor_id: input.actorId,
    p_operation_id: input.operationId,
    p_source_version_id: input.sourceVersionId,
    p_catalog_key: input.catalogKey,
    p_label: input.label,
    p_review_reference: input.reviewReference,
    p_payload_hash: hash(input),
  });
export const editCatalog = (
  input: CommandBase & { versionId: string; expectedRevision: number; patch: { label?: string } },
  client = createSupabaseServiceRoleClient(),
) =>
  rpc(client, 'p309_edit_subscription_catalog', {
    p_actor_id: input.actorId,
    p_operation_id: input.operationId,
    p_version_id: input.versionId,
    p_expected_revision: input.expectedRevision,
    p_label: input.patch.label,
    p_review_reference: input.reviewReference,
    p_payload_hash: hash(input),
  });
export const activateCatalog = (
  input: CommandBase & { versionId: string; expectedRevision: number; effectiveFrom: string },
  client = createSupabaseServiceRoleClient(),
) =>
  rpc(client, 'p309_activate_subscription_catalog', {
    p_actor_id: input.actorId,
    p_operation_id: input.operationId,
    p_version_id: input.versionId,
    p_expected_revision: input.expectedRevision,
    p_effective_from: input.effectiveFrom,
    p_review_reference: input.reviewReference,
    p_payload_hash: hash(input),
  });

export type CatalogListRow = {
  id: string;
  catalogKey: string;
  label: string;
  catalogClass: string;
  currency: string;
  state: string;
  revision: number;
  effectiveFrom: string | null;
  providers: Array<{ provider: string; destination: string; enabled: boolean }>;
};
export async function listCatalogVersions(
  client = createSupabaseServiceRoleClient(),
): Promise<CatalogListRow[]> {
  const [versions, providers] = await Promise.all([
    client
      .from('subscription_catalog_versions')
      .select('id,catalog_key,label,catalog_class,currency,state,revision,effective_from')
      .order('created_at', { ascending: false }),
    client
      .from('subscription_provider_enablement')
      .select('catalog_version_id,provider,destination,enabled'),
  ]);
  if (versions.error || providers.error) throw new Error('CATALOG_UNAVAILABLE');
  const providerRows = (providers.data ?? []) as Array<Record<string, unknown>>;
  return ((versions.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    catalogKey: String(row.catalog_key),
    label: String(row.label),
    catalogClass: String(row.catalog_class),
    currency: String(row.currency),
    state: String(row.state),
    revision: Number(row.revision),
    effectiveFrom: typeof row.effective_from === 'string' ? row.effective_from : null,
    providers: providerRows
      .filter((provider) => provider.catalog_version_id === row.id)
      .map((provider) => ({
        provider: String(provider.provider),
        destination: String(provider.destination),
        enabled: Boolean(provider.enabled),
      })),
  }));
}
