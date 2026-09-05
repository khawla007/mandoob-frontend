import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = join(process.cwd(), 'src/app/(tenant)/t/[tenant]');
const BEHAVIORALLY_AUDITED_RUNNER_FILES = new Set([
  join(root, '(pro)/applications/actions.ts'),
  join(root, '(pro)/documents/actions.ts'),
]);

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

test('every tenant Server Action enters through the authoritative shared role guard', () => {
  const files = filesUnder(root).filter((file) => file.endsWith('actions.ts'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const functions = new Map<string, ts.FunctionLikeDeclaration>();
    const exported: string[] = [];
    for (const statement of ast.statements) {
      if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
      functions.set(statement.name.text, statement);
      if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        exported.push(statement.name.text);
      }
    }
    assert.ok(exported.length > 0, file);
    for (const name of exported) {
      assert.ok(reachesGuard(functions.get(name)!, functions, new Set()), `${file}:${name}`);
      if (!BEHAVIORALLY_AUDITED_RUNNER_FILES.has(file)) {
        assert.equal(
          privilegedCallBeforeGuard(functions.get(name)!, functions, new Set()),
          null,
          `${file}:${name}`,
        );
      }
    }
  }
});

function reachesGuard(
  fn: ts.FunctionLikeDeclaration,
  functions: Map<string, ts.FunctionLikeDeclaration>,
  seen: Set<string>,
): boolean {
  let guarded = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (
        name === 'requireRole' ||
        name === 'requireTenantRouteAccess' ||
        name === 'requireProTenantRouteAccess' ||
        name === 'requireAuthorizedCustomerLinkedCompanyRead' ||
        name === 'authorizeEmployeePortalRead'
      ) {
        guarded = true;
        return;
      }
      const called = functions.get(name);
      if (called && !seen.has(name)) {
        seen.add(name);
        guarded ||= reachesGuard(called, functions, seen);
      }
    }
    if (!guarded) ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return guarded || optionalCustomerAuthorizationDominates(fn);
}

function privilegedCallBeforeGuard(
  fn: ts.FunctionLikeDeclaration,
  functions: Map<string, ts.FunctionLikeDeclaration>,
  seen: Set<string>,
  initiallyGuarded = false,
): string | null {
  if (!fn.body) return null;
  if (optionalCustomerAuthorizationDominates(fn)) return null;
  return scanNode(fn.body, functions, seen, initiallyGuarded).violation;
}

type GuardScan = { guarded: boolean; violation: string | null };

function scanNode(
  node: ts.Node,
  functions: Map<string, ts.FunctionLikeDeclaration>,
  seen: Set<string>,
  initiallyGuarded: boolean,
): GuardScan {
  if (ts.isFunctionLike(node)) return { guarded: initiallyGuarded, violation: null };
  if (ts.isBlock(node)) {
    return scanStatements(node.statements, functions, seen, initiallyGuarded);
  }
  if (ts.isIfStatement(node)) {
    const condition = scanNode(node.expression, functions, seen, initiallyGuarded);
    if (condition.violation) return condition;
    const whenTrue = scanNode(node.thenStatement, functions, new Set(seen), condition.guarded);
    if (whenTrue.violation) return whenTrue;
    const whenFalse = node.elseStatement
      ? scanNode(node.elseStatement, functions, new Set(seen), condition.guarded)
      : { guarded: condition.guarded, violation: null };
    if (whenFalse.violation) return whenFalse;
    return {
      // A guard in only one branch cannot authorize code after the conditional.
      guarded: whenTrue.guarded && whenFalse.guarded,
      violation: null,
    };
  }
  if (ts.isTryStatement(node)) {
    const attempted = scanNode(node.tryBlock, functions, new Set(seen), initiallyGuarded);
    if (attempted.violation) return attempted;
    const caught = node.catchClause
      ? scanNode(node.catchClause.block, functions, new Set(seen), initiallyGuarded)
      : { guarded: initiallyGuarded, violation: null };
    if (caught.violation) return caught;
    const finalized = node.finallyBlock
      ? scanNode(node.finallyBlock, functions, new Set(seen), initiallyGuarded)
      : { guarded: initiallyGuarded, violation: null };
    if (finalized.violation) return finalized;
    // A try/catch can leave through several paths, so do not promote a new guard outside it.
    return { guarded: initiallyGuarded, violation: null };
  }
  if (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  ) {
    let scanned: GuardScan = { guarded: initiallyGuarded, violation: null };
    node.forEachChild((child) => {
      if (scanned.violation) return;
      const childResult = scanNode(child, functions, new Set(seen), initiallyGuarded);
      if (childResult.violation) scanned = childResult;
    });
    return { guarded: initiallyGuarded, violation: scanned.violation };
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    let scanned: GuardScan = { guarded: initiallyGuarded, violation: null };
    for (const argument of node.arguments) {
      scanned = scanNode(argument, functions, seen, scanned.guarded);
      if (scanned.violation) return scanned;
    }
    const name = node.expression.text;
    if (isGuardCall(name)) return { guarded: true, violation: null };
    const called = functions.get(name);
    if (called && !seen.has(name)) {
      const nextSeen = new Set(seen).add(name);
      const calledResult = called.body
        ? scanNode(called.body, functions, nextSeen, scanned.guarded)
        : scanned;
      if (calledResult.violation) return calledResult;
      return {
        guarded: scanned.guarded || helperGuaranteesGuard(called, functions, nextSeen),
        violation: null,
      };
    }
    if (isPrivilegedCall(name) && !scanned.guarded) {
      return { guarded: false, violation: name };
    }
    return scanned;
  }

  let scanned: GuardScan = { guarded: initiallyGuarded, violation: null };
  node.forEachChild((child) => {
    if (scanned.violation || ts.isFunctionLike(child)) return;
    scanned = scanNode(child, functions, seen, scanned.guarded);
  });
  return scanned;
}

function scanStatements(
  statements: ts.NodeArray<ts.Statement>,
  functions: Map<string, ts.FunctionLikeDeclaration>,
  seen: Set<string>,
  initiallyGuarded: boolean,
): GuardScan {
  let scanned: GuardScan = { guarded: initiallyGuarded, violation: null };
  for (const statement of statements) {
    scanned = scanNode(statement, functions, seen, scanned.guarded);
    if (scanned.violation) return scanned;
  }
  return scanned;
}

function helperGuaranteesGuard(
  fn: ts.FunctionLikeDeclaration,
  functions: Map<string, ts.FunctionLikeDeclaration>,
  seen: Set<string>,
): boolean {
  if (!fn.body) return false;
  const result = scanNode(fn.body, functions, seen, false);
  return result.violation === null && result.guarded;
}

function isGuardCall(name: string): boolean {
  return (
    name === 'requireRole' ||
    name === 'requireTenantRouteAccess' ||
    name === 'requireProTenantRouteAccess' ||
    name === 'requireAuthorizedCustomerLinkedCompanyRead' ||
    name === 'authorizeEmployeePortalRead'
  );
}

function isPrivilegedCall(name: string): boolean {
  return (
    name === 'createSupabaseServiceRoleClient' ||
    name === 'mutate' ||
    /^(?:create|update|delete|set|add|cancel|execute|upload|mark|invite|change|resend|request|review|load|get|list|open)[A-Z]/u.test(
      name,
    )
  );
}

test('per-export audit detects a later unguarded server mutation', () => {
  const ast = ts.createSourceFile(
    'fixture-actions.ts',
    `export async function guarded() { await requireRole('pro'); mutate(); }
     export async function unguarded() { mutate(); }`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const functions = new Map<string, ts.FunctionLikeDeclaration>();
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, statement);
    }
  }
  assert.equal(reachesGuard(functions.get('guarded')!, functions, new Set()), true);
  assert.equal(reachesGuard(functions.get('unguarded')!, functions, new Set()), false);
  assert.equal(privilegedCallBeforeGuard(functions.get('guarded')!, functions, new Set()), null);
  assert.equal(
    privilegedCallBeforeGuard(functions.get('unguarded')!, functions, new Set()),
    'mutate',
  );
});

test('optional Customer authorization requires an authorized-kind check', () => {
  const unsafe = `const access = await authorizeCustomerLinkedCompanyRead('acme'); mutate();`;
  const beforeAuthorization = `mutate();
    const access = await authorizeCustomerLinkedCompanyRead('acme');
    if (access.kind !== 'authorized') return;`;
  const late = `const access = await authorizeCustomerLinkedCompanyRead('acme');
    mutate();
    if (access.kind !== 'authorized') return;`;
  const nonTerminating = `const access = await authorizeCustomerLinkedCompanyRead('acme');
    if (access.kind !== 'authorized') logDenied();
    mutate();`;
  const conditional = `if (flag) {
      const access = await authorizeCustomerLinkedCompanyRead('acme');
      if (access.kind !== 'authorized') return;
    }
    mutate();`;
  const siblingBranch = `if (flag) {
      const access = await authorizeCustomerLinkedCompanyRead('acme');
      if (access.kind !== 'authorized') return;
      mutate();
    } else {
      mutate();
    }`;
  const safe = `const access = await authorizeCustomerLinkedCompanyRead('acme');
    if (access.kind !== 'authorized') return;
    mutate();`;
  assert.equal(hasCheckedCustomerAuthorization(unsafe), false);
  assert.equal(hasCheckedCustomerAuthorization(beforeAuthorization), false);
  assert.equal(hasCheckedCustomerAuthorization(late), false);
  assert.equal(hasCheckedCustomerAuthorization(nonTerminating), false);
  assert.equal(hasCheckedCustomerAuthorization(conditional), false);
  assert.equal(hasCheckedCustomerAuthorization(siblingBranch), false);
  assert.equal(hasCheckedCustomerAuthorization(safe), true);

  const ast = ts.createSourceFile(
    'customer-authorization-actions.ts',
    `export async function optionalOnly() { ${unsafe} }
     export async function branchBypass(flag: boolean) { ${siblingBranch} }
     export async function checked() { ${safe} }`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const functions = new Map<string, ts.FunctionLikeDeclaration>();
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, statement);
    }
  }
  assert.equal(reachesGuard(functions.get('optionalOnly')!, functions, new Set()), false);
  assert.equal(
    privilegedCallBeforeGuard(functions.get('optionalOnly')!, functions, new Set()),
    'mutate',
  );
  assert.equal(reachesGuard(functions.get('branchBypass')!, functions, new Set()), false);
  assert.equal(
    privilegedCallBeforeGuard(functions.get('branchBypass')!, functions, new Set()),
    'mutate',
  );
  assert.equal(reachesGuard(functions.get('checked')!, functions, new Set()), true);
  assert.equal(privilegedCallBeforeGuard(functions.get('checked')!, functions, new Set()), null);
});

function hasCheckedCustomerAuthorization(source: string): boolean {
  const ast = ts.createSourceFile(
    'customer-authorization-fixture.ts',
    `async function fixture() { ${source} }`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const fixture = ast.statements.find(ts.isFunctionDeclaration);
  return fixture ? optionalCustomerAuthorizationDominates(fixture) : false;
}

function optionalCustomerAuthorizationDominates(fn: ts.FunctionLikeDeclaration): boolean {
  if (!fn.body || !ts.isBlock(fn.body)) return false;
  return blockHasDominatingCustomerAuthorization(fn.body);
}

function blockHasDominatingCustomerAuthorization(block: ts.Block): boolean {
  for (let index = 0; index < block.statements.length; index += 1) {
    const accessName = optionalCustomerAccessName(block.statements[index]);
    if (!accessName) continue;
    for (let before = 0; before < index; before += 1) {
      if (firstPrivilegedCall(block.statements[before])) return false;
    }
    for (let guardIndex = index + 1; guardIndex < block.statements.length; guardIndex += 1) {
      const statement = block.statements[guardIndex];
      if (!isRejectingCustomerGuard(statement, accessName)) continue;
      for (let between = index + 1; between < guardIndex; between += 1) {
        if (firstPrivilegedCall(block.statements[between])) return false;
      }
      return true;
    }
    return false;
  }

  for (let index = 0; index < block.statements.length; index += 1) {
    const statement = block.statements[index];
    if (!ts.isTryStatement(statement)) continue;
    if (!blockHasDominatingCustomerAuthorization(statement.tryBlock)) continue;
    if (statement.catchClause && firstPrivilegedCall(statement.catchClause.block)) return false;
    if (statement.finallyBlock && firstPrivilegedCall(statement.finallyBlock)) return false;
    for (let sibling = 0; sibling < block.statements.length; sibling += 1) {
      if (sibling !== index && firstPrivilegedCall(block.statements[sibling])) return false;
    }
    return true;
  }
  return false;
}

function optionalCustomerAccessName(statement: ts.Statement): string | null {
  if (!ts.isVariableStatement(statement)) return null;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
    const initializer = ts.isAwaitExpression(declaration.initializer)
      ? declaration.initializer.expression
      : declaration.initializer;
    if (
      ts.isCallExpression(initializer) &&
      ts.isIdentifier(initializer.expression) &&
      initializer.expression.text === 'authorizeCustomerLinkedCompanyRead'
    ) {
      return declaration.name.text;
    }
  }
  return null;
}

function isRejectingCustomerGuard(statement: ts.Statement, accessName: string): boolean {
  if (!ts.isIfStatement(statement)) return false;
  const condition = statement.expression;
  if (
    !ts.isBinaryExpression(condition) ||
    condition.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    !ts.isPropertyAccessExpression(condition.left) ||
    !ts.isIdentifier(condition.left.expression) ||
    condition.left.expression.text !== accessName ||
    condition.left.name.text !== 'kind' ||
    !ts.isStringLiteral(condition.right) ||
    condition.right.text !== 'authorized'
  ) {
    return false;
  }
  return statementTerminates(statement.thenStatement);
}

function statementTerminates(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (!ts.isBlock(statement)) return false;
  return statement.statements.some(statementTerminates);
}

function firstPrivilegedCall(node: ts.Node): string | null {
  let violation: string | null = null;
  const visit = (child: ts.Node) => {
    if (violation || ts.isFunctionLike(child)) return;
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      isPrivilegedCall(child.expression.text)
    ) {
      violation = child.expression.text;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return violation;
}

test('guard must dominate mutation while a guarded helper path succeeds', () => {
  const ast = ts.createSourceFile(
    'fixture-actions.ts',
    `async function authorize() { await requireRole('pro'); }
     export async function late() { mutate(); await requireRole('pro'); }
     export async function helperGuarded() { await authorize(); mutate(); }`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const functions = new Map<string, ts.FunctionLikeDeclaration>();
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, statement);
    }
  }
  assert.equal(privilegedCallBeforeGuard(functions.get('late')!, functions, new Set()), 'mutate');
  assert.equal(
    privilegedCallBeforeGuard(functions.get('helperGuarded')!, functions, new Set()),
    null,
  );
});

test('a conditional guard does not dominate a later mutation', () => {
  const ast = ts.createSourceFile(
    'fixture-actions.ts',
    `export async function conditional(flag: boolean) {
       if (flag) await requireRole('pro');
       mutate();
     }`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const functions = new Map<string, ts.FunctionLikeDeclaration>();
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, statement);
    }
  }

  assert.equal(
    privilegedCallBeforeGuard(functions.get('conditional')!, functions, new Set()),
    'mutate',
  );
});

test('imported action-runner allowlist is narrow and backed by behavioral tests', () => {
  assert.equal(BEHAVIORALLY_AUDITED_RUNNER_FILES.size, 2);
  for (const file of BEHAVIORALLY_AUDITED_RUNNER_FILES) {
    assert.ok(statSync(file.replace(/actions\.ts$/u, 'actions.test.ts')).isFile(), file);
  }
});

test('PRO self-service mutations use the PRO-only boundary and never fabricate actor role', () => {
  const proRoot = join(root, '(pro)');
  const mutationFiles = filesUnder(proRoot).filter(
    (file) => !file.endsWith('.test.ts') && /(?:actions|action-logic)\.ts$/u.test(file),
  );
  for (const file of mutationFiles) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /role:\s*'pro'\s*[,}]/u, file);
  }
  for (const relative of [
    'applications/actions.ts',
    'documents/actions.ts',
    'company/setup/actions.ts',
    'meetings/actions.ts',
    'payments/actions.ts',
    'renewals/actions.ts',
    'imports/actions.ts',
    'settings/billing/actions.ts',
  ]) {
    assert.match(
      readFileSync(join(proRoot, relative), 'utf8'),
      /requireProTenantRouteAccess/u,
      relative,
    );
  }
});

test('every direct service-role page and route enters through the tenant route boundary first', () => {
  const files = filesUnder(root).filter(
    (file) =>
      /\/(page|route)\.tsx?$/u.test(file) &&
      readFileSync(file, 'utf8').includes('createSupabaseServiceRoleClient'),
  );
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.match(
      source,
      /await (?:require(?:Pro)?TenantRouteAccess|authorizeCustomerLinkedCompanyRead|authorizeEmployeePortalRead)\(/u,
      file,
    );
  }
});

test('every tenant page or route using a DAL declares an authoritative boundary', () => {
  const publicTokenRoute = join(root, '(customer)/portal/account/erasure/verify/route.ts');
  const files = filesUnder(root).filter(
    (file) =>
      /\/(page|route)\.tsx?$/u.test(file) && readFileSync(file, 'utf8').includes('@/lib/data/'),
  );
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (file === publicTokenRoute) {
      assert.match(source, /verifyErasureRequest\(token\)/u);
      assert.doesNotMatch(source, /createSupabaseServiceRoleClient/u);
      continue;
    }
    assert.match(
      source,
      /await (?:require(?:Pro)?TenantRouteAccess|authorizeCustomerLinkedCompanyRead|authorizeEmployeePortalRead)\(/u,
      file,
    );
  }
});

test('Customer document pages check the authorized Company state before direct loader reads', () => {
  const customerRoot = join(root, '(customer)');
  const files = filesUnder(customerRoot).filter((file) => {
    if (!file.endsWith('/page.tsx')) return false;
    const source = readFileSync(file, 'utf8');
    return (
      source.includes('authorizeCustomerLinkedCompanyRead') &&
      source.includes('loadCustomerDocumentCenter')
    );
  });
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const authorization = source.indexOf("access.kind === 'authorized'");
    const load = source.indexOf('loadCustomerDocumentCenter', source.indexOf('export default'));
    assert.ok(authorization !== -1 && authorization < load, file);
  }
});

test('Customer actions check optional Company authorization before privileged work', () => {
  const customerRoot = join(root, '(customer)');
  const files = filesUnder(customerRoot).filter((file) => {
    if (!file.endsWith('/actions.ts')) return false;
    return readFileSync(file, 'utf8').includes('authorizeCustomerLinkedCompanyRead');
  });
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const optionalCallers = ast.statements.filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.getText(ast).includes('authorizeCustomerLinkedCompanyRead('),
    );
    assert.ok(optionalCallers.length > 0, file);
    for (const fn of optionalCallers) {
      assert.equal(optionalCustomerAuthorizationDominates(fn), true, `${file}:${fn.name?.text}`);
    }
  }
});

test('PRO workspace pages are gated as PRO-only before rendering mutation controls', () => {
  const proRoot = join(root, '(pro)');
  const files = filesUnder(proRoot).filter(
    (file) =>
      /\/(?:page|route)\.tsx?$/u.test(file) && readFileSync(file, 'utf8').includes('@/lib/data/'),
  );
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.match(readFileSync(file, 'utf8'), /await requireProTenantRouteAccess\(/u, file);
  }
  assert.match(
    readFileSync(join(proRoot, 'layout.tsx'), 'utf8'),
    /await requireProTenantRouteAccess\(/u,
  );
});

test('sensitive indirect DAL and inline-action pages declare their own tenant boundary', () => {
  const relativeFiles = [
    '(pro)/employees/page.tsx',
    '(pro)/employees/import/page.tsx',
    '(pro)/imports/[jobId]/page.tsx',
    '(pro)/leads/page.tsx',
    '(pro)/payments/page.tsx',
    '(pro)/payments/[invoiceId]/page.tsx',
    '(pro)/payments/[invoiceId]/receipt/route.ts',
    '(pro)/payments/analytics/page.tsx',
    '(pro)/renewals/page.tsx',
    '(pro)/settings/page.tsx',
    '(pro)/settings/billing/page.tsx',
    '(customer)/portal/payments/[invoiceId]/receipt/route.ts',
  ];
  for (const relative of relativeFiles) {
    const source = readFileSync(join(root, relative), 'utf8');
    assert.match(
      source,
      /await (?:require(?:Pro)?TenantRouteAccess|authorizeCustomerLinkedCompanyRead)\(/u,
      relative,
    );
  }
});

test('bulk import authorization precedes failure compensation and all updates are tenant scoped', () => {
  const file = join(root, '(pro)/imports/actions.ts');
  const source = readFileSync(file, 'utf8');
  for (const action of ['validateBulkImportAction', 'executeBulkImportAction']) {
    const start = source.indexOf(`export async function ${action}`);
    const next = source.indexOf('\nexport async function ', start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    assert.ok(
      body.indexOf('await requireTenantContext(') < body.indexOf('runAuthorizedMutation({'),
      action,
    );
    assert.match(body, /markFailed\(tenant\.id, company\.id, jobId,/u, action);
  }
  const update = source.slice(source.indexOf('async function updateJob('));
  assert.match(
    update,
    /scopeImportJobMutation\([\s\S]*?query,[\s\S]*?tenantId,[\s\S]*?companyId,[\s\S]*?jobId,[\s\S]*?expectedStatus/u,
  );
  assert.match(update, /\.select\('id'\)\s*\.maybeSingle\(\)/u);
  assert.match(update, /assertImportJobTransitionMatched\(data\)/u);
  const scope = readFileSync(join(process.cwd(), 'src/lib/data/import-job-scope.ts'), 'utf8');
  assert.ok(scope.indexOf(".eq('tenant_id', tenantId)") < scope.indexOf(".eq('id', jobId)"));
  assert.ok(scope.indexOf(".eq('company_id', companyId)") < scope.indexOf(".eq('id', jobId)"));

  const page = readFileSync(join(root, '(pro)/imports/[jobId]/page.tsx'), 'utf8');
  assert.match(page, /isImportJobCancellable\(job\.status\)/u);
  assert.match(page, /t\('cannotCancel'\)/u);
});

test('tenant layout resolves the slug then enforces authoritative company access', () => {
  const file = join(root, 'layout.tsx');
  const source = readFileSync(file, 'utf8');
  assert.match(source, /await requireCompanyAccess\(tenant\.id\)/u);
  assert.ok(
    source.indexOf('resolveTenantBySlug(slug)') < source.indexOf('await requireCompanyAccess'),
  );
  assert.doesNotMatch(source, /session\.tenantId|session\.role/u);
});
