import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';

const validDefinition = {
  key: 'company-registration',
  version: 1,
  sections: [
    {
      id: 'applicant',
      title: 'Applicant',
      order: 1,
      fields: [{ id: 'full_name', type: 'text', label: 'Full name', order: 1, required: true }],
    },
  ],
};

test('save validates definition structure before calling the RPC', async () => {
  const { saveQuestionnaireDraft } = await import('./definitions');
  let called = false;
  await assert.rejects(
    saveQuestionnaireDraft(
      { key: 'company-registration', title: 'X', expectedVersion: 0, definition: { bad: true } },
      {
        rpc: async () => {
          called = true;
          return { data: {}, error: null };
        },
      },
    ),
    /invalid/i,
  );
  assert.equal(called, false);
});

test('save passes a definition hash and expected version to the RPC', async () => {
  const { saveQuestionnaireDraft } = await import('./definitions');
  let args: Record<string, unknown> | undefined;
  const result = await saveQuestionnaireDraft(
    {
      key: 'company-registration',
      title: 'Company registration',
      expectedVersion: 0,
      definition: validDefinition,
    },
    {
      rpc: async (fn, received) => {
        args = { fn, ...received };
        return { data: { definitionId: 'd1', version: 1, rowVersion: 1 }, error: null };
      },
    },
  );
  assert.equal(result.version, 1);
  assert.equal(args?.fn, 'save_questionnaire_draft');
  assert.match(args?.p_definition_hash as string, /^[a-f0-9]{64}$/u);
  assert.equal(args?.p_expected_definition_version, 0);
});

test('mutations map stale version and forbidden RPC errors to safe codes', async () => {
  const { saveQuestionnaireDraft, publishQuestionnaireVersion } = await import('./definitions');
  await assert.rejects(
    saveQuestionnaireDraft(
      { key: 'company-registration', title: 'T', expectedVersion: 5, definition: validDefinition },
      { rpc: async () => ({ data: null, error: { code: '40001' } }) },
    ),
    /updated elsewhere/,
  );
  await assert.rejects(
    publishQuestionnaireVersion(
      { definitionId: 'd1', version: 1, expectedVersion: 1 },
      { rpc: async () => ({ data: null, error: { code: '42501' } }) },
    ),
    /operator/,
  );
});

test('publish and archive call their dedicated RPCs', async () => {
  const { publishQuestionnaireVersion, archiveQuestionnaireVersion } =
    await import('./definitions');
  let publishFn: string | undefined;
  let archiveFn: string | undefined;
  await publishQuestionnaireVersion(
    { definitionId: 'd1', version: 2, expectedVersion: 3 },
    {
      rpc: async (fn) => {
        publishFn = fn;
        return { data: { publishedVersion: 2, rowVersion: 4 }, error: null };
      },
    },
  );
  await archiveQuestionnaireVersion(
    { definitionId: 'd1', version: 2, expectedVersion: 4 },
    {
      rpc: async (fn) => {
        archiveFn = fn;
        return { data: { archivedVersion: 2, rowVersion: 5 }, error: null };
      },
    },
  );
  assert.equal(publishFn, 'publish_questionnaire_version');
  assert.equal(archiveFn, 'archive_questionnaire_version');
});
