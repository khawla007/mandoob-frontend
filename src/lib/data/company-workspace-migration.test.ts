import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function readMigration(filename: string): string {
  return readFileSync(join(process.cwd(), 'supabase/migrations', filename), 'utf8').toLowerCase();
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');
}

function normalizeSql(sql: string): string {
  return stripSqlComments(sql).replace(/\s+/g, ' ').trim();
}

function extractFunction(sql: string, name: string): string {
  const functionDefinition = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\)\\s+returns\\s+[\\s\\S]*?\\bas\\s+(\\$\\$|\\$[a-z_][a-z0-9_]*\\$)[\\s\\S]*?\\1\\s*;`,
    'i',
  ).exec(sql);
  assert.ok(functionDefinition, `${name} function definition is missing`);
  return functionDefinition[0];
}

function assertServiceRolePrivileges(sql: string, name: string): void {
  const revoke = new RegExp(
    `revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\s*\\([^;]*?\\)\\s+from\\s+([^;]+);`,
    'i',
  ).exec(sql);
  assert.ok(revoke, `${name} must revoke public execution`);
  assert.match(revoke[1], /\bpublic\b/i);
  assert.match(revoke[1], /\banon\b/i);
  assert.match(revoke[1], /\bauthenticated\b/i);

  const grants = [
    ...sql.matchAll(
      new RegExp(
        `grant\\s+(?:execute|all(?:\\s+privileges)?)\\s+on\\s+function\\s+public\\.${name}\\s*\\([^;]*?\\)\\s+to\\s+([^;]+);`,
        'gi',
      ),
    ),
  ];
  assert.ok(grants.length > 0, `${name} must grant function access`);
  for (const grant of grants) {
    assert.equal(grant[1].trim(), 'service_role');
  }
}

test('company workspace migration establishes one-to-one ownership', () => {
  const companyWorkspaceSql = normalizeSql(
    readMigration('20260817090000_0059_company_workspace_rebase.sql'),
  );
  assert.match(
    companyWorkspaceSql,
    /alter\s+table\s+public\.clients\s+rename\s+to\s+company_profiles/,
  );
  assert.match(companyWorkspaceSql, /truncate\s+table\s+public\.company_profiles\s+cascade\s*;/);
  assert.ok(
    companyWorkspaceSql.indexOf('truncate table public.company_profiles cascade') <
      companyWorkspaceSql.indexOf('company_profiles_one_per_tenant unique'),
    'development ownership reset must run before the one-company constraint',
  );
  assert.match(
    companyWorkspaceSql,
    /alter\s+table\s+public\.company_profiles\s+add\s+(?:constraint\s+\S+\s+)?unique\s*\(\s*tenant_id\s*\)\s*;/,
  );
  assert.match(
    companyWorkspaceSql,
    /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.pro_company_assignments/,
  );
  assert.match(
    companyWorkspaceSql,
    /create\s+unique\s+index(?:\s+if\s+not\s+exists)?\s+\S+\s+on\s+public\.pro_company_assignments\s*\(\s*company_id\s*\)\s+where\s+status\s*=\s*'active'/,
  );
  assert.match(
    companyWorkspaceSql,
    /create\s+unique\s+index(?:\s+if\s+not\s+exists)?\s+\S+\s+on\s+public\.pro_company_assignments\s*\(\s*pro_profile_id\s*\)\s+where\s+status\s*=\s*'active'/,
  );
  assert.match(
    companyWorkspaceSql,
    /alter\s+table\s+public\.(?:clients|company_profiles)\s+drop\s+column(?:\s+if\s+exists)?\s+assigned_pro_profile_id/,
  );
});

test('company workspace migration recreates every current ownership function', () => {
  const companyWorkspaceSql = normalizeSql(
    readMigration('20260817090000_0059_company_workspace_rebase.sql'),
  );
  const functions: Array<[string, RegExp]> = [
    [
      'create_service_case_with_audit',
      /\(\s*p_tenant_id\s+uuid\s*,\s*p_actor_id\s+uuid\s*,\s*p_company_id\s+uuid\s*,\s*p_title\s+text\s*,\s*p_service_type\s+text\s*,\s*p_priority\s+text\s*,\s*p_assigned_to\s+uuid\s*,\s*p_due_at\s+timestamptz\s*,\s*p_sla_due_at\s+timestamptz\s*,\s*p_blocked_reason\s+text\s*,\s*p_changed_keys\s+text\[\]\s*\)\s*returns\s+uuid\b/,
    ],
    [
      'update_service_case_with_audit',
      /\(\s*p_tenant_id\s+uuid\s*,\s*p_actor_id\s+uuid\s*,\s*p_case_id\s+uuid\s*,\s*p_patch\s+jsonb\s*,\s*p_changed_keys\s+text\[\]\s*\)\s*returns\s+uuid\b/,
    ],
    [
      'list_pro_document_center',
      /\(\s*p_tenant_id\s+uuid\s*,\s*p_view\s+text\s+default\s+'all'\s*,\s*p_search\s+text\s+default\s+null\s*,\s*p_company_id\s+uuid\s+default\s+null\s*,\s*p_doc_type\s+text\s+default\s+null\s*,\s*p_due_from\s+date\s+default\s+null\s*,\s*p_due_to\s+date\s+default\s+null\s*,\s*p_expiry_from\s+date\s+default\s+null\s*,\s*p_expiry_to\s+date\s+default\s+null\s*,\s*p_sort\s+text\s+default\s+'urgency'\s*,\s*p_focus_kind\s+text\s+default\s+null\s*,\s*p_focus_id\s+uuid\s+default\s+null\s*,\s*p_page\s+integer\s+default\s+1\s*,\s*p_page_size\s+integer\s+default\s+50\s*\)\s*returns\s+table\s*\([\s\S]*?company_id\s+uuid\b/,
    ],
    [
      'set_pro_document_expiry',
      /\(\s*p_tenant_id\s+uuid\s*,\s*p_document_id\s+uuid\s*,\s*p_actor_id\s+uuid\s*,\s*p_expires_on\s+date\s*\)\s*returns\s+table\s*\([\s\S]*?company_id\s+uuid\b/,
    ],
    [
      'review_document_version',
      /\(\s*p_tenant_id\s+uuid\s*,\s*p_actor_id\s+uuid\s*,\s*p_version_id\s+uuid\s*,\s*p_status\s+text\s*,\s*p_note\s+text\s*,\s*p_reviewed_at\s+timestamptz\s*\)\s*returns\s+table\s*\([\s\S]*?company_id\s+uuid\b/,
    ],
    [
      'admin_change_role_atomic',
      /\(\s*p_target_id\s+uuid\s*,\s*p_actor_id\s+uuid\s*,\s*p_expected_role\s+text\s*,\s*p_expected_tenant_id\s+uuid\s*,\s*p_new_role\s+text\s*,\s*p_new_tenant_id\s+uuid\s*,\s*p_role_data\s+jsonb\s*,\s*p_reason\s+text\s+default\s+null\s*\)\s*returns\s+jsonb\b/,
    ],
    ['renewals_sync_from_license', /\(\s*\)\s*returns\s+trigger\b/],
    [
      'get_pro_document_version_history',
      /\(\s*p_tenant_id\s+uuid\s*,\s*p_document_id\s+uuid\s*\)\s*returns\s+jsonb\b/,
    ],
  ];

  for (const [name, signature] of functions) {
    const definition = extractFunction(companyWorkspaceSql, name);
    assert.match(definition, signature, `${name} has an unexpected signature`);
    assert.doesNotMatch(
      definition,
      /\b(?:p_)?client_id\b|\blinked_client_id\b|\bconverted_client_id\b|public\.clients\b/,
      `${name} retains stale client ownership identifiers`,
    );
  }
});

test('recreated ownership functions preserve their historical security boundaries', () => {
  const companyWorkspaceSql = normalizeSql(
    readMigration('20260817090000_0059_company_workspace_rebase.sql'),
  );
  const createCase = extractFunction(companyWorkspaceSql, 'create_service_case_with_audit');
  const updateCase = extractFunction(companyWorkspaceSql, 'update_service_case_with_audit');
  const adminChange = extractFunction(companyWorkspaceSql, 'admin_change_role_atomic');
  const listDocuments = extractFunction(companyWorkspaceSql, 'list_pro_document_center');
  const versionHistory = extractFunction(companyWorkspaceSql, 'get_pro_document_version_history');
  const setExpiry = extractFunction(companyWorkspaceSql, 'set_pro_document_expiry');
  const reviewVersion = extractFunction(companyWorkspaceSql, 'review_document_version');
  const renewalSync = extractFunction(companyWorkspaceSql, 'renewals_sync_from_license');

  for (const [name, definition] of [
    ['create_service_case_with_audit', createCase],
    ['update_service_case_with_audit', updateCase],
  ] as const) {
    assert.match(definition, /security\s+definer/);
    assert.match(definition, /set\s+search_path\s*=\s*pg_catalog\s*,\s*public/);
    assert.match(
      definition,
      /from\s+public\.tenants\s+where\s+id\s*=\s*p_tenant_id\s+and\s+status\s*=\s*'active'\s+for\s+share/,
    );
    assert.match(
      definition,
      /from\s+public\.profiles\s+where\s+id\s*=\s*p_actor_id\s+and\s+tenant_id\s*=\s*p_tenant_id\s+and\s+role\s*=\s*'pro'\s+and\s+status\s*=\s*'active'\s+for\s+share/,
    );
    assert.match(definition, /insert\s+into\s+public\.tenant_audit_log/);
    assertServiceRolePrivileges(companyWorkspaceSql, name);
  }

  assert.match(adminChange, /security\s+definer/);
  assert.match(adminChange, /set\s+search_path\s*=\s*pg_catalog\s*,\s*public/);
  assert.match(
    adminChange,
    /from\s+public\.profiles\s+where\s+id\s*=\s*p_target_id\s+for\s+update/,
  );
  assert.match(adminChange, /insert\s+into\s+public\.admin_audit_actions/);
  assertServiceRolePrivileges(companyWorkspaceSql, 'admin_change_role_atomic');

  assert.match(listDocuments, /language\s+sql\s+stable\s+security\s+invoker/);
  assert.match(listDocuments, /where\s+c\.tenant_id\s*=\s*p_tenant_id/);
  assertServiceRolePrivileges(companyWorkspaceSql, 'list_pro_document_center');

  assert.match(versionHistory, /language\s+sql\s+stable\s+security\s+invoker/);
  assert.match(versionHistory, /set\s+search_path\s*=\s*''/);
  assert.match(versionHistory, /c\.tenant_id\s*=\s*p_tenant_id/);
  assertServiceRolePrivileges(companyWorkspaceSql, 'get_pro_document_version_history');

  for (const [name, definition] of [
    ['set_pro_document_expiry', setExpiry],
    ['review_document_version', reviewVersion],
  ] as const) {
    assert.match(definition, /language\s+plpgsql\s+volatile\s+security\s+invoker/);
    assert.match(definition, /set\s+search_path\s*=\s*''/);
    assert.match(definition, /from\s+public\.tenants[\s\S]*?for\s+share/);
    assert.match(definition, /from\s+public\.profiles[\s\S]*?for\s+share/);
    assert.match(definition, /for\s+update/);
    assert.match(definition, /insert\s+into\s+public\.tenant_audit_log/);
    assertServiceRolePrivileges(companyWorkspaceSql, name);
  }

  assert.match(renewalSync, /security\s+definer/);
  assert.match(renewalSync, /set\s+search_path\s*=\s*public/);
  assert.match(renewalSync, /insert\s+into\s+public\.tenant_audit_log/);
  assert.match(
    companyWorkspaceSql,
    /revoke\s+execute\s+on\s+function\s+public\.renewals_sync_from_license\s*\(\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/,
  );
});

test('company workspace migration exposes company ownership in the ranked case view', () => {
  const companyWorkspaceSql = normalizeSql(
    readMigration('20260817090000_0059_company_workspace_rebase.sql'),
  );
  const view = /create\s+(?:or\s+replace\s+)?view\s+public\.service_cases_ranked\b[\s\S]*?;/i.exec(
    companyWorkspaceSql,
  );
  assert.ok(view, 'service_cases_ranked view recreation is missing');
  assert.match(view[0], /with\s*\(\s*security_invoker\s*=\s*true\s*\)/);
  assert.match(view[0], /\bcompany_id\b/);
  assert.doesNotMatch(view[0], /\bclient_id\b/);
  assert.match(
    companyWorkspaceSql,
    /revoke\s+all\s+on\s+(?:table\s+)?public\.service_cases_ranked\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/,
  );
  assert.match(
    companyWorkspaceSql,
    /grant\s+select\s+on\s+(?:table\s+)?public\.service_cases_ranked\s+to\s+service_role\s*;/,
  );
});

test('active assignments block incompatible direct and atomic profile transitions', () => {
  const companyWorkspaceSql = normalizeSql(
    readMigration('20260817090000_0059_company_workspace_rebase.sql'),
  );
  const guard = extractFunction(
    companyWorkspaceSql,
    'guard_active_pro_company_assignment_transition',
  );
  assert.match(guard, /security\s+definer/);
  assert.match(guard, /set\s+search_path\s*=\s*pg_catalog\s*,\s*public/);
  assert.match(guard, /from\s+public\.pro_company_assignments\s+(?:as\s+)?assignment\b/);
  assert.match(guard, /assignment\.pro_profile_id\s*=\s*old\.id/);
  assert.match(guard, /assignment\.status\s*=\s*'active'/);
  assert.match(guard, /new\.role\s+is\s+distinct\s+from\s+'pro'/);
  assert.match(guard, /new\.status\s+is\s+distinct\s+from\s+'active'/);
  assert.match(guard, /new\.tenant_id\s+is\s+distinct\s+from\s+assignment\.tenant_id/);
  assert.match(guard, /message\s*=\s*'active_pro_company_assignment'/);
  assert.match(
    companyWorkspaceSql,
    /revoke\s+all\s+on\s+function\s+public\.guard_active_pro_company_assignment_transition\s*\(\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/,
  );
  assert.match(
    companyWorkspaceSql,
    /create\s+trigger\s+profiles_guard_active_company_assignment\s+before\s+update\s+of\s+role\s*,\s*status\s*,\s*tenant_id\s+on\s+public\.profiles/,
  );

  const adminChange = extractFunction(companyWorkspaceSql, 'admin_change_role_atomic');
  assert.match(adminChange, /from\s+public\.pro_company_assignments\s+(?:as\s+)?assignment\b/);
  assert.match(adminChange, /assignment\.pro_profile_id\s*=\s*p_target_id/);
  assert.match(adminChange, /assignment\.status\s*=\s*'active'/);
  assert.match(adminChange, /message\s*=\s*'active_pro_company_assignment'/);
});

test('assignment RPC migration exposes atomic lifecycle operations', () => {
  const assignmentRpcSql = normalizeSql(
    readMigration('20260817091000_0060_company_assignment_rpcs_rls.sql'),
  );
  for (const name of ['assign_pro_to_company', 'release_company_pro', 'reassign_company_pro']) {
    const functionDefinition = extractFunction(assignmentRpcSql, name);
    assert.match(functionDefinition, /security\s+definer/);
    assert.match(functionDefinition, /set\s+search_path\s*=\s*''/);
    assert.match(functionDefinition, /for\s+update/);
    assertServiceRolePrivileges(assignmentRpcSql, name);
  }
});

test('live PRO access reads assignment state instead of trusting a tenant JWT', () => {
  const assignmentRpcSql = normalizeSql(
    readMigration('20260817091000_0060_company_assignment_rpcs_rls.sql'),
  );
  const functionDefinition = extractFunction(assignmentRpcSql, 'has_company_access');
  assert.match(functionDefinition, /security\s+definer/);
  assert.match(functionDefinition, /set\s+search_path\s*=\s*''/);
  assert.match(functionDefinition, /from\s+public\.pro_company_assignments\s+(?:as\s+)?a\b/);
  assert.match(functionDefinition, /a\.pro_profile_id\s*=\s*p\.id/);
  assert.match(functionDefinition, /p\.id\s*=\s*auth\.uid\s*\(\s*\)/);
  assert.match(functionDefinition, /p\.status\s*=\s*'active'/);
  assert.match(functionDefinition, /p\.role\s+in\s*\(\s*'admin'\s*,\s*'super_admin'\s*\)/);
  assert.match(
    functionDefinition,
    /p\.role\s+in\s*\(\s*'customer'\s*,\s*'employee'\s*\)\s+and\s+p\.tenant_id\s*=\s*p_tenant_id/,
  );
  assert.match(functionDefinition, /p\.role\s*=\s*'pro'\s+and\s+exists\s*\(/);
  assert.match(functionDefinition, /a\.tenant_id\s*=\s*p_tenant_id/);
  assert.match(functionDefinition, /a\.status\s*=\s*'active'/);
  assert.match(functionDefinition, /auth\.uid\s*\(\s*\)/);
  assert.match(
    assignmentRpcSql,
    /revoke\s+all\s+on\s+function\s+public\.has_company_access\s*\(\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/,
  );
  assert.match(
    assignmentRpcSql,
    /grant\s+execute\s+on\s+function\s+public\.has_company_access\s*\(\s*uuid\s*\)\s+to\s+authenticated\s*,\s*service_role\s*;/,
  );
});
