import 'server-only';

import { ApiError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { hashRequest } from '@/lib/public-intake/security';
import {
  questionnaireDefinitionSchema,
  validateQuestionnaireDefinition,
  type QuestionnaireDefinition,
} from './versioned-definition';

export type DefinitionVersionState = 'draft' | 'published' | 'archived';

export type DefinitionVersionRow = {
  version: number;
  state: DefinitionVersionState;
  definitionHash: string;
  createdAt: string;
  publishedAt: string | null;
};

export type DefinitionSummary = {
  definitionId: string;
  key: string;
  title: string;
  rowVersion: number;
  currentDraftVersion: number;
  currentPublishedVersion: number | null;
  versions: DefinitionVersionRow[];
  draftDefinition: QuestionnaireDefinition | null;
};

type ReadDeps = { supabase?: ReturnType<typeof createSupabaseServiceRoleClient> };
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
type MutateDeps = { rpc?: (fn: string, args: Record<string, unknown>) => Promise<RpcResult> };

export async function getQuestionnaireDefinition(
  definitionKey: string,
  deps: ReadDeps = {},
): Promise<DefinitionSummary | null> {
  const admin = deps.supabase ?? createSupabaseServiceRoleClient();
  const { data: def, error } = await admin
    .from('questionnaire_definitions')
    .select(
      'id, definition_key, title, current_draft_version, current_published_version, row_version',
    )
    .eq('definition_key', definitionKey)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!def) return null;

  const { data: versions, error: versionsError } = await admin
    .from('questionnaire_definition_versions')
    .select('version, state, definition, definition_hash, created_at, published_at')
    .eq('definition_id', def.id)
    .order('version', { ascending: false });
  if (versionsError) throw new ApiError('INTERNAL', versionsError.message, 500);

  const rows = (versions ?? []) as Array<{
    version: number;
    state: DefinitionVersionState;
    definition: unknown;
    definition_hash: string;
    created_at: string;
    published_at: string | null;
  }>;
  const draftRow = rows.find(
    (row) => row.state === 'draft' && row.version === def.current_draft_version,
  );

  return {
    definitionId: def.id,
    key: def.definition_key,
    title: def.title,
    rowVersion: def.row_version,
    currentDraftVersion: def.current_draft_version,
    currentPublishedVersion: def.current_published_version,
    versions: rows.map((row) => ({
      version: row.version,
      state: row.state,
      definitionHash: row.definition_hash,
      createdAt: row.created_at,
      publishedAt: row.published_at,
    })),
    draftDefinition: draftRow
      ? (questionnaireDefinitionSchema.safeParse(draftRow.definition).data ?? null)
      : null,
  };
}

function runner(deps: MutateDeps) {
  return (
    deps.rpc ??
    (async (fn: string, args: Record<string, unknown>) => {
      const supabase = await createSupabaseServerClient();
      return (await supabase.rpc(fn as never, args as never)) as RpcResult;
    })
  );
}

export async function saveQuestionnaireDraft(
  input: { key: string; title: string; expectedVersion: number; definition: unknown },
  deps: MutateDeps = {},
): Promise<{ definitionId: string; version: number; rowVersion: number }> {
  const parsed = questionnaireDefinitionSchema.safeParse(input.definition);
  if (!parsed.success) {
    throw new ApiError('INVALID_DEFINITION', 'The definition structure is invalid.', 400);
  }
  const validation = validateQuestionnaireDefinition(parsed.data);
  if (!validation.ok) {
    throw new ApiError('INVALID_DEFINITION', validation.issues.join(' '), 400);
  }
  const { data, error } = await runner(deps)('save_questionnaire_draft', {
    p_definition_key: input.key,
    p_title: input.title,
    p_expected_definition_version: input.expectedVersion,
    p_definition: parsed.data,
    p_definition_hash: hashRequest(parsed.data),
  });
  if (error || !data) throw mapDefinitionError(error);
  return data as { definitionId: string; version: number; rowVersion: number };
}

export async function publishQuestionnaireVersion(
  input: { definitionId: string; version: number; expectedVersion: number },
  deps: MutateDeps = {},
): Promise<{ publishedVersion: number; rowVersion: number }> {
  const { data, error } = await runner(deps)('publish_questionnaire_version', {
    p_definition_id: input.definitionId,
    p_version: input.version,
    p_expected_definition_version: input.expectedVersion,
  });
  if (error || !data) throw mapDefinitionError(error);
  return data as { publishedVersion: number; rowVersion: number };
}

export async function archiveQuestionnaireVersion(
  input: { definitionId: string; version: number; expectedVersion: number },
  deps: MutateDeps = {},
): Promise<{ archivedVersion: number; rowVersion: number }> {
  const { data, error } = await runner(deps)('archive_questionnaire_version', {
    p_definition_id: input.definitionId,
    p_version: input.version,
    p_expected_definition_version: input.expectedVersion,
  });
  if (error || !data) throw mapDefinitionError(error);
  return data as { archivedVersion: number; rowVersion: number };
}

function mapDefinitionError(error: { code?: string; message?: string } | null): ApiError {
  const message = error?.message ?? '';
  if (error?.code === '40001' || message.includes('STALE_DEFINITION_VERSION')) {
    return new ApiError(
      'VERSION_CONFLICT',
      'This definition was updated elsewhere. Reload and retry.',
      409,
    );
  }
  if (error?.code === '42501' || message.includes('FORBIDDEN')) {
    return new ApiError('FORBIDDEN', 'An MFA-verified platform operator is required.', 403);
  }
  if (error?.code === 'P0002' || message.includes('DEFINITION_NOT_FOUND')) {
    return new ApiError('NOT_FOUND', 'Questionnaire definition not found.', 404);
  }
  if (
    error?.code === 'P0001' ||
    message.includes('NOT_PUBLISHABLE') ||
    message.includes('NOT_ARCHIVABLE')
  ) {
    return new ApiError(
      'INVALID_STATE',
      'The version is not in a valid state for this action.',
      409,
    );
  }
  if (error?.code === '22023' || message.includes('INVALID_DEFINITION')) {
    return new ApiError('INVALID_DEFINITION', 'The definition is invalid.', 400);
  }
  return new ApiError('INTERNAL', 'Could not update the questionnaire definition.', 500);
}
