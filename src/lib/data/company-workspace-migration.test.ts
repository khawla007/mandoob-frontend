import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function readMigration(filename: string): string {
  return readFileSync(join(process.cwd(), 'supabase/migrations', filename), 'utf8').toLowerCase();
}

function readSqlFixture(filename: string): string {
  return readFileSync(join(process.cwd(), 'supabase/tests', filename), 'utf8').toLowerCase();
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

function extractPolicies(sql: string, table: string, schema = 'public'): string[] {
  return [
    ...sql.matchAll(
      new RegExp(`create\\s+policy\\s+\\S+\\s+on\\s+${schema}\\.${table}\\b[\\s\\S]*?;`, 'gi'),
    ),
  ].map((match) => match[0]);
}

function extractAlterTableStatements(sql: string, table: string): string[] {
  return [
    ...sql.matchAll(new RegExp(`alter\\s+table\\s+public\\.${table}\\b[\\s\\S]*?;`, 'gi')),
  ].map((match) => match[0]);
}

type EffectivePolicy = { relation: string; name: string; sql: string; migration: string };

function effectivePolicies(): EffectivePolicy[] {
  const policies = new Map<string, EffectivePolicy>();
  const normalizeRelation = (relation: string) =>
    relation.includes('.') ? relation.toLowerCase() : `public.${relation.toLowerCase()}`;

  for (const migration of readdirSync(join(process.cwd(), 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = stripSqlComments(readMigration(migration));
    const events: Array<{
      index: number;
      kind: 'create' | 'drop' | 'table_rename' | 'policy_rename';
      relation: string;
      name?: string;
      replacement?: string;
      sql?: string;
    }> = [];

    for (const match of sql.matchAll(
      /create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)[\s\S]*?;/gi,
    )) {
      events.push({
        index: match.index,
        kind: 'create',
        relation: normalizeRelation(match[2]),
        name: match[1].toLowerCase(),
        sql: normalizeSql(match[0]),
      });
    }
    for (const match of sql.matchAll(
      /drop\s+policy\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)\s+on\s+((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)\s*;/gi,
    )) {
      events.push({
        index: match.index,
        kind: 'drop',
        relation: normalizeRelation(match[2]),
        name: match[1].toLowerCase(),
      });
    }
    for (const match of sql.matchAll(
      /alter\s+table\s+((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)\s+rename\s+to\s+([a-z_][a-z0-9_]*)\s*;/gi,
    )) {
      events.push({
        index: match.index,
        kind: 'table_rename',
        relation: normalizeRelation(match[1]),
        replacement: normalizeRelation(match[2]),
      });
    }
    for (const match of sql.matchAll(
      /alter\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)\s+rename\s+to\s+([a-z_][a-z0-9_]*)\s*;/gi,
    )) {
      events.push({
        index: match.index,
        kind: 'policy_rename',
        relation: normalizeRelation(match[2]),
        name: match[1].toLowerCase(),
        replacement: match[3].toLowerCase(),
      });
    }

    for (const event of events.sort((left, right) => left.index - right.index)) {
      if (event.kind === 'table_rename') {
        for (const [key, policy] of [...policies]) {
          if (policy.relation !== event.relation) continue;
          policies.delete(key);
          const renamed = { ...policy, relation: event.replacement! };
          policies.set(`${renamed.relation}.${renamed.name}`, renamed);
        }
        continue;
      }
      const key = `${event.relation}.${event.name}`;
      if (event.kind === 'drop') {
        policies.delete(key);
      } else if (event.kind === 'policy_rename') {
        const policy = policies.get(key);
        if (policy) {
          policies.delete(key);
          const renamed = { ...policy, name: event.replacement! };
          policies.set(`${renamed.relation}.${renamed.name}`, renamed);
        }
      } else {
        policies.set(key, {
          relation: event.relation,
          name: event.name!,
          sql: event.sql!,
          migration,
        });
      }
    }
  }

  return [...policies.values()];
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
      /\b(?:p_)?client[_]id\b|\blinked[_]client[_]id\b|\bconverted[_]client[_]id\b|public\.clients\b/,
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
  assert.doesNotMatch(view[0], /\bclient[_]id\b/);
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

test('assignment RPCs enforce the complete assignment lifecycle in one transaction', () => {
  const assignmentRpcSql = normalizeSql(
    readMigration('20260817091000_0060_company_assignment_rpcs_rls.sql'),
  );
  const assign = extractFunction(assignmentRpcSql, 'assign_pro_to_company');
  assert.match(
    assign,
    /\(\s*p_company_id\s+uuid\s*,\s*p_pro_profile_id\s+uuid\s*,\s*p_actor_profile_id\s+uuid\s*\)\s*returns\s+uuid/,
  );
  for (const code of [
    'PRO_NOT_VERIFIED',
    'PRO_INACTIVE',
    'PRO_ALREADY_ASSIGNED',
    'COMPANY_ALREADY_ASSIGNED',
    'COMPANY_NOT_READY',
    'COMPANY_INACTIVE',
  ]) {
    assert.match(assign, new RegExp(`message\\s*=\\s*'${code.toLowerCase()}'`));
  }
  assert.match(assign, /from\s+public\.company_profiles[\s\S]*?for\s+update/);
  assert.match(assign, /from\s+public\.profiles[\s\S]*?for\s+update/);
  assert.match(assign, /from\s+public\.pro_company_assignments[\s\S]*?for\s+update/);
  assert.match(assign, /from\s+public\.pro_profiles/);
  assert.match(assign, /credentials_verified\s*=\s*true/);
  assert.match(assign, /update\s+auth\.users[\s\S]*?raw_app_meta_data/);
  assert.match(assign, /insert\s+into\s+public\.tenant_audit_log/);

  const release = extractFunction(assignmentRpcSql, 'release_company_pro');
  assert.match(
    release,
    /\(\s*p_company_id\s+uuid\s*,\s*p_expected_assignment_id\s+uuid\s*,\s*p_reason\s+text\s*,\s*p_actor_profile_id\s+uuid\s*\)\s*returns\s+uuid/,
  );
  assert.match(release, /message\s*=\s*'stale_assignment'/);
  assert.match(release, /status\s*=\s*'released'/);
  assert.match(release, /tenant_id\s*=\s*null/);
  assert.match(
    release,
    /raw_app_meta_data\s*=\s*(?:coalesce\s*\(\s*raw_app_meta_data\s*,\s*'\{\}'::jsonb\s*\)|raw_app_meta_data)\s*-\s*'tenant_id'/,
  );
  assert.match(release, /status\s*=\s*'unassigned'/);
  assert.match(release, /insert\s+into\s+public\.tenant_audit_log/);

  const reassign = extractFunction(assignmentRpcSql, 'reassign_company_pro');
  assert.match(
    reassign,
    /\(\s*p_company_id\s+uuid\s*,\s*p_expected_assignment_id\s+uuid\s*,\s*p_replacement_pro_profile_id\s+uuid\s*,\s*p_reason\s+text\s*,\s*p_actor_profile_id\s+uuid\s*\)\s*returns\s+uuid/,
  );
  assert.match(reassign, /message\s*=\s*'stale_assignment'/);
  assert.match(reassign, /order\s+by\s+id\s+for\s+update/);
  assert.match(reassign, /status\s*=\s*'released'/);
  assert.match(reassign, /insert\s+into\s+public\.pro_company_assignments/);
  assert.match(reassign, /update\s+auth\.users[\s\S]*?raw_app_meta_data/);
  assert.ok(
    (reassign.match(/'company_pro_(?:released|assigned)'/g) ?? []).length >= 2,
    'reassignment must audit both release and assignment transitions',
  );
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

test('company-scoped RLS uses live access and preserves self-only reads', () => {
  const assignmentRpcSql = normalizeSql(
    readMigration('20260817091000_0060_company_assignment_rpcs_rls.sql'),
  );
  for (const table of [
    'company_profiles',
    'employees',
    'document_requests',
    'documents',
    'document_versions',
    'renewals',
    'invoices',
    'payments',
    'refunds',
    'meetings',
    'meeting_ai_summaries',
    'bulk_import_jobs',
    'service_cases',
  ]) {
    const policies = extractPolicies(assignmentRpcSql, table);
    assert.ok(
      policies.some((policy) => /has_company_access\s*\(/.test(policy)),
      `${table} lacks a bounded live company-access policy`,
    );
  }
  const employeeSelf = extractPolicies(assignmentRpcSql, 'employees').find((policy) =>
    /create\s+policy\s+employees_self_read\b/.test(policy),
  );
  assert.ok(employeeSelf);
  assert.match(employeeSelf, /has_company_access\s*\(/);
  assert.match(employeeSelf, /profile_id\s*=\s*auth\.uid\s*\(\s*\)/);
  for (const table of ['renewals', 'documents', 'document_requests']) {
    const policy = extractPolicies(assignmentRpcSql, table).find((candidate) =>
      new RegExp(`create\\s+policy\\s+${table}_employee_self_read\\b`).test(candidate),
    );
    assert.ok(policy, `${table} employee self-read policy is missing`);
    assert.match(policy, /has_company_access\s*\(/);
    assert.match(policy, /profile_id\s*=\s*auth\.uid\s*\(\s*\)/);
  }
  assert.doesNotMatch(
    assignmentRpcSql,
    /create\s+policy[\s\S]*?tenant_id\s*=\s*\(\(auth\.jwt\s*\(\s*\)\s*->\s*'app_metadata'/,
  );
});

test('adjacent profile policies retain self ownership behind live company access', () => {
  const assignmentRpcSql = normalizeSql(
    readMigration('20260817091000_0060_company_assignment_rpcs_rls.sql'),
  );

  const customerPolicies = extractPolicies(assignmentRpcSql, 'customer_profiles');
  const customerSelf = customerPolicies.find((policy) =>
    /create\s+policy\s+customer_profiles_self_rw\b/.test(policy),
  );
  assert.ok(customerSelf, 'customer profile self policy is missing');
  assert.match(customerSelf, /profile_id\s*=\s*auth\.uid\s*\(\s*\)/);
  assert.match(customerSelf, /has_company_access\s*\(/);
  assert.match(customerSelf, /with\s+check/);

  const operatorRead = customerPolicies.find((policy) =>
    /create\s+policy\s+customer_profiles_tenant_pro_read\b/.test(policy),
  );
  assert.ok(operatorRead, 'customer profile operator policy is missing');
  assert.match(operatorRead, /has_company_access\s*\(/);
  assert.match(operatorRead, /role\s+in\s*\(\s*'pro'\s*,\s*'admin'\s*,\s*'super_admin'\s*\)/);
  assert.match(operatorRead, /status\s*=\s*'active'/);

  const preferencePolicies = extractPolicies(assignmentRpcSql, 'employee_notification_preferences');
  for (const [name, command] of [
    ['employee_notification_preferences_self_read', 'select'],
    ['employee_notification_preferences_self_update', 'update'],
    ['employee_notification_preferences_self_insert', 'insert'],
  ] as const) {
    const policy = preferencePolicies.find((candidate) =>
      new RegExp(`create\\s+policy\\s+${name}\\b`).test(candidate),
    );
    assert.ok(policy, `${name} is missing`);
    assert.match(policy, new RegExp(`for\\s+${command}\\b`));
    assert.match(policy, /profile_id\s*=\s*auth\.uid\s*\(\s*\)/);
    assert.match(policy, /has_company_access\s*\(\s*tenant_id\s*\)/);
    if (command !== 'select') assert.match(policy, /with\s+check/);
  }
});

test('company ownership foreign keys reject cross-company relational chains', () => {
  const sql = normalizeSql(readMigration('20260817091000_0060_company_assignment_rpcs_rls.sql'));
  for (const table of [
    'employees',
    'document_requests',
    'documents',
    'renewals',
    'invoices',
    'meetings',
    'bulk_import_jobs',
  ]) {
    const ownership =
      /foreign\s+key\s*\(\s*tenant_id\s*,\s*company_id\s*\)[\s\S]*?references\s+public\.company_profiles\s*\(\s*tenant_id\s*,\s*id\s*\)/;
    assert.ok(
      extractAlterTableStatements(sql, table).some((statement) => ownership.test(statement)),
      `${table} lacks composite company ownership`,
    );
  }
  for (const [child, columns, parent, parentColumns] of [
    ['document_versions', 'tenant_id, document_id', 'documents', 'tenant_id, id'],
    ['meeting_ai_summaries', 'tenant_id, meeting_id', 'meetings', 'tenant_id, id'],
    ['payments', 'tenant_id, invoice_id', 'invoices', 'tenant_id, id'],
    ['refunds', 'tenant_id, payment_id', 'payments', 'tenant_id, id'],
  ] as const) {
    const columnPattern = columns.replace(/, /g, '\\s*,\\s*');
    const parentPattern = parentColumns.replace(/, /g, '\\s*,\\s*');
    const chain = new RegExp(
      `foreign\\s+key\\s*\\(\\s*${columnPattern}\\s*\\)[\\s\\S]*?references\\s+public\\.${parent}\\s*\\(\\s*${parentPattern}\\s*\\)`,
    );
    assert.ok(
      extractAlterTableStatements(sql, child).some((statement) => chain.test(statement)),
      `${child} lacks its composite parent chain`,
    );
  }

  const invoicesCustomer = extractPolicies(sql, 'invoices').find((policy) =>
    /create\s+policy\s+invoices_customer_read\b/.test(policy),
  );
  assert.ok(invoicesCustomer);
  assert.match(invoicesCustomer, /cp\.linked_company_id\s*=\s*invoices\.company_id/);

  const paymentsCustomer = extractPolicies(sql, 'payments').find((policy) =>
    /create\s+policy\s+payments_customer_read\b/.test(policy),
  );
  assert.ok(paymentsCustomer);
  assert.match(paymentsCustomer, /i\.tenant_id\s*=\s*payments\.tenant_id/);

  const refundsCustomer = extractPolicies(sql, 'refunds').find((policy) =>
    /create\s+policy\s+refunds_customer_read\b/.test(policy),
  );
  assert.ok(refundsCustomer);
  assert.match(refundsCustomer, /p\.tenant_id\s*=\s*refunds\.tenant_id/);
  assert.match(refundsCustomer, /i\.tenant_id\s*=\s*refunds\.tenant_id/);

  const meetingsCustomer = extractPolicies(sql, 'meetings').find((policy) =>
    /create\s+policy\s+meetings_customer_read\b/.test(policy),
  );
  assert.ok(meetingsCustomer);
  assert.match(meetingsCustomer, /cp\.linked_company_id\s*=\s*meetings\.company_id/);

  const summaryCustomer = extractPolicies(sql, 'meeting_ai_summaries').find((policy) =>
    /create\s+policy\s+meeting_ai_summaries_customer_read\b/.test(policy),
  );
  assert.ok(summaryCustomer);
  assert.match(summaryCustomer, /m\.tenant_id\s*=\s*meeting_ai_summaries\.tenant_id/);
});

test('assignment lifecycle uses one lock protocol and validates release reasons at the boundary', () => {
  const sql = normalizeSql(readMigration('20260817091000_0060_company_assignment_rpcs_rls.sql'));
  const lockHelper = extractFunction(sql, 'lock_company_assignment_resources');
  assert.match(lockHelper, /pg_advisory_xact_lock\s*\(/);
  assert.match(lockHelper, /pg_advisory_xact_lock\s*\(\s*v_lock_namespace\s*,\s*v_lock_key\s*\)/);
  assert.match(lockHelper, /hashtext\s*\(/);
  assert.match(lockHelper, /order\s+by\s+requested\.lock_namespace\s*,\s*requested\.lock_key/);

  for (const name of ['assign_pro_to_company', 'release_company_pro', 'reassign_company_pro']) {
    assert.match(extractFunction(sql, name), /lock_company_assignment_resources\s*\(/);
  }
  const assign = extractFunction(sql, 'assign_pro_to_company');
  assert.ok(
    assign.indexOf('lock_company_assignment_resources') <
      assign.indexOf('from public.company_profiles'),
    'assign must acquire advisory resources before company row locks',
  );
  for (const name of ['release_company_pro', 'reassign_company_pro']) {
    const fn = extractFunction(sql, name);
    const firstLock = fn.indexOf('lock_company_assignment_resources');
    const secondLock = fn.indexOf('lock_company_assignment_resources', firstLock + 1);
    const authoritativeAssignmentLock = fn.indexOf(
      'from public.pro_company_assignments',
      secondLock,
    );
    assert.ok(firstLock >= 0 && secondLock > firstLock);
    assert.ok(
      authoritativeAssignmentLock > secondLock,
      `${name} must lock discovered resources before authoritative assignment row locks`,
    );
  }
  assert.ok(
    (
      extractFunction(sql, 'release_company_pro').match(
        /lock_company_assignment_resources\s*\(/g,
      ) ?? []
    ).length >= 2,
    'release must lock the company before discovering and locking the current PRO',
  );
  assert.ok(
    (
      extractFunction(sql, 'reassign_company_pro').match(
        /lock_company_assignment_resources\s*\(/g,
      ) ?? []
    ).length >= 2,
    'reassignment must lock the company before locking both PRO resources',
  );
  for (const name of ['release_company_pro', 'reassign_company_pro']) {
    const fn = extractFunction(sql, name);
    assert.match(fn, /v_reason\s*:=\s*btrim\s*\(\s*p_reason\s*\)/);
    assert.match(fn, /v_reason\s+is\s+null/);
    assert.match(fn, /char_length\s*\(\s*v_reason\s*\)\s+not\s+between\s+3\s+and\s+500/);
    assert.match(fn, /release_reason\s*=\s*v_reason/);
    assert.match(fn, /'reason'\s*,\s*v_reason/);
  }
  assert.match(
    sql,
    /status\s*=\s*'released'\s+and[\s\S]*?release_reason\s+is\s+not\s+null[\s\S]*?char_length\s*\(\s*trim\s*\(\s*release_reason\s*\)\s*\)\s+between\s+3\s+and\s+500/,
  );
});

test('legacy permissive policies are explicitly removed and verification fields are not self-writable', () => {
  const sql = normalizeSql(readMigration('20260817091000_0060_company_assignment_rpcs_rls.sql'));
  for (const [schema, table, policy] of [
    ['public', 'profiles', 'profiles_super_admin_write'],
    ['public', 'profiles', 'profiles_admin_read_all'],
    ['public', 'profiles', 'profiles_admin_write_non_super'],
    ['public', 'pro_profiles', 'pro_profiles_self_update'],
    ['public', 'pro_profiles', 'pro_profiles_super_admin_all'],
    ['public', 'leads', 'leads_platform_read_all'],
    ['public', 'lead_events', 'lead_events_platform_read_all'],
    ['public', 'consent_opt_outs', 'consent_opt_outs_admin_all'],
    ['public', 'consent_opt_outs', 'consent_opt_outs_customer_self_read'],
    ['storage', 'objects', 'tenant_documents_super_admin_read'],
    ['storage', 'objects', 'tenant_documents_admin_read'],
    ['storage', 'objects', 'tenant_documents_tenant_read'],
    ['storage', 'objects', 'tenant_documents_tenant_write'],
    ['storage', 'objects', 'tenant_imports_admin_read'],
    ['storage', 'objects', 'tenant_imports_tenant_read'],
    ['storage', 'objects', 'tenant_imports_tenant_write'],
    ['storage', 'objects', 'tenant_meetings_platform_read'],
    ['storage', 'objects', 'tenant_meetings_tenant_read'],
    ['storage', 'objects', 'tenant_meetings_system_write'],
  ] as const) {
    assert.match(
      sql,
      new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${policy}\\s+on\\s+${schema}\\.${table}`),
      `${schema}.${table}.${policy} is not explicitly removed`,
    );
  }

  assert.match(
    sql,
    /revoke\s+update\s+on\s+table\s+public\.pro_profiles\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
  );
  const safeGrant =
    /grant\s+update\s*\(([^)]+)\)\s+on\s+table\s+public\.pro_profiles\s+to\s+authenticated/.exec(
      sql,
    );
  assert.ok(safeGrant, 'safe PRO self-update column grant is missing');
  assert.doesNotMatch(
    safeGrant[1],
    /license_no_encrypted|designation|department|credentials_verified|verified_at|verified_by_profile_id/,
  );

  const proSafeUpdate = extractPolicies(sql, 'pro_profiles').find((policy) =>
    /create\s+policy\s+pro_profiles_self_safe_update\b/.test(policy),
  );
  assert.ok(proSafeUpdate);
  assert.match(proSafeUpdate, /for\s+update/);
  assert.match(proSafeUpdate, /profile_id\s*=\s*auth\.uid\s*\(\s*\)/);
  assert.match(proSafeUpdate, /role\s*=\s*'pro'/);
  assert.match(proSafeUpdate, /status\s*=\s*'active'/);
  assert.match(proSafeUpdate, /with\s+check/);

  for (const [table, name] of [
    ['profiles', 'profiles_platform_read'],
    ['pro_profiles', 'pro_profiles_platform_read'],
    ['leads', 'leads_platform_read_all'],
    ['lead_events', 'lead_events_platform_read_all'],
  ] as const) {
    const policy = extractPolicies(sql, table).find((candidate) =>
      new RegExp(`create\\s+policy\\s+${name}\\b`).test(candidate),
    );
    assert.ok(policy, `${name} is missing`);
    assert.match(policy, /has_company_access\s*\(\s*null::uuid\s*\)/);
  }
  const consentAdmin = extractPolicies(sql, 'consent_opt_outs').find((policy) =>
    /create\s+policy\s+consent_opt_outs_admin_all\b/.test(policy),
  );
  assert.ok(consentAdmin);
  assert.match(consentAdmin, /for\s+all/);
  assert.match(consentAdmin, /has_company_access\s*\(\s*null::uuid\s*\)/);
  assert.match(consentAdmin, /with\s+check/);

  for (const policy of [
    ...extractPolicies(sql, 'profiles'),
    ...extractPolicies(sql, 'pro_profiles'),
    ...extractPolicies(sql, 'leads'),
    ...extractPolicies(sql, 'lead_events'),
    ...extractPolicies(sql, 'consent_opt_outs'),
    ...extractPolicies(sql, 'objects', 'storage'),
  ]) {
    assert.doesNotMatch(policy, /auth\.jwt\s*\(/, 'new policy still trusts JWT role/scope');
  }

  const storageHelper = extractFunction(sql, 'has_company_storage_access');
  assert.match(storageHelper, /case\s+when[\s\S]*?then\s+public\.has_company_access/);
  assert.match(storageHelper, /else\s+false/);
  for (const name of [
    'tenant_documents_platform_read',
    'tenant_documents_tenant_read',
    'tenant_documents_tenant_write',
    'tenant_imports_platform_read',
    'tenant_imports_tenant_read',
    'tenant_imports_tenant_write',
    'tenant_meetings_platform_read',
    'tenant_meetings_tenant_read',
    'tenant_meetings_system_write',
  ]) {
    const policy = extractPolicies(sql, 'objects', 'storage').find((candidate) =>
      new RegExp(`create\\s+policy\\s+${name}\\b`).test(candidate),
    );
    assert.ok(policy, `${name} is missing`);
    assert.match(policy, /has_company_storage_access\s*\(\s*name\s*\)/);
    if (name.includes('platform')) {
      assert.match(policy, /has_company_access\s*\(\s*null::uuid\s*\)/);
    } else {
      assert.match(policy, /role\s+in?\s*\(|role\s*=\s*'pro'/);
      assert.match(policy, /status\s*=\s*'active'/);
    }
  }
});

test('effective policies contain no cached JWT authorization and retain public reads', () => {
  const policies = effectivePolicies();
  const staleJwtPolicies = policies.filter((policy) => /auth\.jwt\s*\(/.test(policy.sql));
  assert.deepEqual(
    staleJwtPolicies.map((policy) => `${policy.relation}.${policy.name} (${policy.migration})`),
    [],
  );
  const finalPolicyKeys = new Set(policies.map((policy) => `${policy.relation}.${policy.name}`));
  for (const publicRead of [
    'public.blog_posts.blog_posts_public_read_published',
    'public.blog_terms.blog_terms_public_read',
    'public.blog_media.blog_media_public_read',
    'public.blog_post_terms.blog_post_terms_public_read',
    'public.blog_post_gallery_items.blog_post_gallery_items_public_read',
    'storage.objects.blog_media_storage_public_read',
    'public.cms_pages.cms_pages_public_read_published',
  ]) {
    assert.ok(finalPolicyKeys.has(publicRead), `${publicRead} public read was lost`);
  }
});

test('nullable customer and employee links retain composite workspace ownership', () => {
  const sql = normalizeSql(readMigration('20260817091000_0060_company_assignment_rpcs_rls.sql'));
  assert.match(
    sql,
    /create\s+unique\s+index(?:\s+if\s+not\s+exists)?\s+customer_profiles_company_profile_key\s+on\s+public\.customer_profiles\s*\(\s*linked_company_id\s*,\s*profile_id\s*\)/,
  );
  assert.match(
    sql,
    /create\s+unique\s+index(?:\s+if\s+not\s+exists)?\s+profiles_tenant_id_id_key\s+on\s+public\.profiles\s*\(\s*tenant_id\s*,\s*id\s*\)/,
  );
  for (const [table, columns, parent, parentColumns] of [
    [
      'invoices',
      'company_id, customer_profile_id',
      'customer_profiles',
      'linked_company_id, profile_id',
    ],
    [
      'meetings',
      'company_id, customer_profile_id',
      'customer_profiles',
      'linked_company_id, profile_id',
    ],
    ['employees', 'tenant_id, profile_id', 'profiles', 'tenant_id, id'],
  ] as const) {
    const childPattern = columns.replace(/, /g, '\\s*,\\s*');
    const parentPattern = parentColumns.replace(/, /g, '\\s*,\\s*');
    const ownership = new RegExp(
      `foreign\\s+key\\s*\\(\\s*${childPattern}\\s*\\)[\\s\\S]*?references\\s+public\\.${parent}\\s*\\(\\s*${parentPattern}\\s*\\)`,
    );
    assert.ok(
      extractAlterTableStatements(sql, table).some((statement) => ownership.test(statement)),
      `${table} lacks composite nullable-link ownership`,
    );
  }
});

test('SQL fixtures cover credential denial and coordinated lifecycle races', () => {
  const privilege = normalizeSql(readSqlFixture('pro_profile_verification_privileges.sql'));
  assert.match(privilege, /has_column_privilege[\s\S]*?'credentials_verified'[\s\S]*?'update'/);
  assert.match(privilege, /has_column_privilege[\s\S]*?'license_no_encrypted'[\s\S]*?'update'/);
  assert.match(privilege, /has_column_privilege[\s\S]*?'bio'[\s\S]*?'update'/);

  const fixtures = [
    'company_assignment_concurrency_session_a.sql',
    'company_assignment_concurrency_session_b.sql',
    'company_assignment_release_assign_session_a.sql',
    'company_assignment_release_assign_session_b.sql',
    'company_assignment_swap_reassign_session_a.sql',
    'company_assignment_swap_reassign_session_b.sql',
  ].map((name) => [name, normalizeSql(readSqlFixture(name))] as const);
  for (const [name, fixture] of fixtures) {
    assert.doesNotMatch(
      fixture,
      /\\quit\s+\d+/,
      `${name} uses a psql \\quit argument that PostgreSQL 17 ignores`,
    );
    assert.match(
      fixture,
      /\\set\s+on_error_stop\s+on[\s\S]*?select\s+1\s*\/\s*0/,
      `${name} lacks a portable nonzero assertion exit`,
    );
    assert.match(fixture, /lock_timeout/);
    assert.match(fixture, /statement_timeout/);
    assert.match(fixture, /actor_[ab]_profile_id/, `${name} lacks a distinct actor variable`);
    assert.match(fixture, /\\set\s+lifecycle_sqlstate\s+:sqlstate/);
    assert.match(fixture, /lifecycle_sqlstate[\s\S]*?40p01[\s\S]*?55p03[\s\S]*?57014/);
    if (name.endsWith('_session_b.sql')) assert.match(fixture, /\\gset[\s\S]*?\\if/);
  }
  const expectedSqlStates = new Map<string, string>([
    ['company_assignment_concurrency_session_a.sql', '00000'],
    ['company_assignment_concurrency_session_b.sql', 'p0001'],
    ['company_assignment_release_assign_session_a.sql', '00000'],
    ['company_assignment_release_assign_session_b.sql', '00000'],
    ['company_assignment_swap_reassign_session_a.sql', 'p0001'],
    ['company_assignment_swap_reassign_session_b.sql', 'p0001'],
  ]);
  for (const [name, fixture] of fixtures) {
    assert.match(
      fixture,
      new RegExp(`lifecycle_sqlstate'\\s*=\\s*'${expectedSqlStates.get(name)}'`),
      `${name} does not assert its expected lifecycle SQLSTATE`,
    );
  }
  const combined = fixtures.map(([, sql]) => sql).join(' ');
  assert.match(combined, /actor_a_profile_id'::uuid\s*<>\s*:'actor_b_profile_id'::uuid/);
  assert.match(combined, /assign_pro_to_company/);
  assert.match(combined, /release_company_pro/);
  assert.match(combined, /reassign_company_pro/);
  assert.match(combined, /count\s*\(\s*\*\s*\)[\s\S]*?status\s*=\s*'active'/);
  assert.match(combined, /raw_app_meta_data/);
  assert.match(combined, /tenant_audit_log/);
  assert.match(combined, /profiles/);
});
