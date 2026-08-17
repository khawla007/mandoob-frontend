import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const companyWorkspaceMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260817090000_0059_company_workspace_rebase.sql'),
  'utf8',
).toLowerCase();
const assignmentRpcMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260817091000_0060_company_assignment_rpcs_rls.sql'),
  'utf8',
).toLowerCase();

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

const companyWorkspaceSql = normalizeSql(companyWorkspaceMigration);
const assignmentRpcSql = normalizeSql(assignmentRpcMigration);

test('company workspace migration establishes one-to-one ownership', () => {
  assert.match(
    companyWorkspaceSql,
    /alter\s+table\s+public\.clients\s+rename\s+to\s+company_profiles/,
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

test('assignment RPC migration exposes atomic lifecycle operations', () => {
  for (const name of ['assign_pro_to_company', 'release_company_pro', 'reassign_company_pro']) {
    const functionDefinition = extractFunction(assignmentRpcSql, name);
    assert.match(functionDefinition, /security\s+definer/);
    assert.match(functionDefinition, /set\s+search_path\s*=\s*''/);
    assert.match(functionDefinition, /for\s+update/);
    assertServiceRolePrivileges(assignmentRpcSql, name);
  }
});

test('live PRO access reads assignment state instead of trusting a tenant JWT', () => {
  const functionDefinition = extractFunction(assignmentRpcSql, 'has_company_access');
  assert.match(functionDefinition, /security\s+definer/);
  assert.match(functionDefinition, /set\s+search_path\s*=\s*''/);
  assert.match(functionDefinition, /from\s+public\.pro_company_assignments\s+(?:as\s+)?a\b/);
  assert.match(functionDefinition, /a\.pro_profile_id\s*=\s*p\.id/);
  assert.match(functionDefinition, /p\.id\s*=\s*auth\.uid\s*\(\s*\)/);
  assert.match(functionDefinition, /a\.tenant_id\s*=\s*p_tenant_id/);
  assert.match(functionDefinition, /a\.status\s*=\s*'active'/);
  assert.match(functionDefinition, /auth\.uid\s*\(\s*\)/);
});
