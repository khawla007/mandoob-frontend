import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const LEGACY_PUBLIC_CALLERS = [
  'src/app/api/v1/auth/check-username/route.ts',
  'src/app/api/v1/auth/forgot-password/route.ts',
  'src/app/api/v1/auth/invite/accept/route.ts',
  'src/app/api/v1/auth/login/route.ts',
  'src/app/api/v1/auth/mfa/enroll/route.ts',
  'src/app/api/v1/auth/mfa/recovery/route.ts',
  'src/app/api/v1/auth/mfa/verify/route.ts',
  'src/app/api/v1/auth/phone-otp/start/route.ts',
  'src/app/api/v1/auth/register/route.ts',
  'src/app/api/v1/auth/resend-otp/route.ts',
  'src/app/api/v1/auth/reset-password/route.ts',
  'src/app/api/v1/auth/verify-otp/route.ts',
  'src/app/api/v1/public/estimate/pdf/route.ts',
  'src/lib/data/erasure.ts',
] as const;

const FIRST_PROHIBITED_CALL = new Map<(typeof LEGACY_PUBLIC_CALLERS)[number], string>([
  ['src/app/api/v1/auth/check-username/route.ts', 'createSupabaseServiceRoleClient'],
  ['src/app/api/v1/auth/forgot-password/route.ts', 'parseJson'],
  ['src/app/api/v1/auth/invite/accept/route.ts', 'parseJson'],
  ['src/app/api/v1/auth/login/route.ts', 'parseJson'],
  ['src/app/api/v1/auth/phone-otp/start/route.ts', 'parseJson'],
  ['src/app/api/v1/auth/register/route.ts', 'parseJson'],
  ['src/app/api/v1/auth/resend-otp/route.ts', 'parseJson'],
  ['src/app/api/v1/auth/reset-password/route.ts', 'createSupabaseServerClient'],
  ['src/app/api/v1/auth/verify-otp/route.ts', 'parseJson'],
  ['src/app/api/v1/public/estimate/pdf/route.ts', 'parseJson'],
  ['src/lib/data/erasure.ts', 'createSupabaseServiceRoleClient'],
]);

const MFA_ROUTES = new Map<
  (typeof LEGACY_PUBLIC_CALLERS)[number],
  { providerCall: string; preAuthLabel: string; keyPrefix: string; userLabel: string }
>([
  [
    'src/app/api/v1/auth/mfa/enroll/route.ts',
    {
      providerCall: 'createSupabaseServerClient',
      preAuthLabel: 'auth-mfa-enroll-preauth',
      keyPrefix: 'mfa-enroll-preauth:',
      userLabel: 'auth.mfa.enroll',
    },
  ],
  [
    'src/app/api/v1/auth/mfa/recovery/route.ts',
    {
      providerCall: 'createSupabaseServerClient',
      preAuthLabel: 'auth-mfa-recovery-preauth',
      keyPrefix: 'mfa-recovery-preauth:',
      userLabel: 'auth.mfa.recovery',
    },
  ],
  [
    'src/app/api/v1/auth/mfa/verify/route.ts',
    {
      providerCall: 'createServerClient',
      preAuthLabel: 'auth-mfa-verify-preauth',
      keyPrefix: 'mfa-verify-preauth:',
      userLabel: 'auth.mfa.verify',
    },
  ],
]);

function descendants(node: ts.Node): ts.Node[] {
  const result: ts.Node[] = [];
  node.forEachChild((child) => {
    result.push(child, ...descendants(child));
  });
  return result;
}

function isCallTo(node: ts.Node, name: string): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name
  );
}

function branchForDecision(
  nodes: ts.Node[],
  decisionName: string,
  literal: 'limited' | 'unavailable',
) {
  return nodes.find(
    (node): node is ts.IfStatement =>
      ts.isIfStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ((ts.isIdentifier(node.expression.left) &&
        node.expression.left.text === decisionName &&
        ts.isStringLiteral(node.expression.right) &&
        node.expression.right.text === literal) ||
        (ts.isIdentifier(node.expression.right) &&
          node.expression.right.text === decisionName &&
          ts.isStringLiteral(node.expression.left) &&
          node.expression.left.text === literal)),
  );
}

function branchForIdentifier(nodes: ts.Node[], identifier: string): ts.IfStatement | undefined {
  return nodes.find(
    (node): node is ts.IfStatement =>
      ts.isIfStatement(node) &&
      [node.expression, ...descendants(node.expression)].some(
        (child) => ts.isIdentifier(child) && child.text === identifier,
      ),
  );
}

function auditedFunction(sourceFile: ts.SourceFile, file: string): ts.FunctionDeclaration {
  const functionName =
    file === 'src/lib/data/erasure.ts'
      ? 'createErasureRequest'
      : file === 'src/app/api/v1/auth/check-username/route.ts'
        ? 'GET'
        : 'POST';
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
  );
  assert.ok(declaration?.body, `${file} must define ${functionName}`);
  return declaration;
}

function decisionName(call: ts.CallExpression): string | undefined {
  let current: ts.Node | undefined = call.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    current = current.parent;
  }
  return undefined;
}

function callMentioning(nodes: ts.Node[], name: string): ts.CallExpression | undefined {
  return nodes.find(
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) &&
      [node.expression, ...descendants(node.expression)].some(
        (child) => ts.isIdentifier(child) && child.text === name,
      ),
  );
}

function propertyLiteral(config: ts.ObjectLiteralExpression, name: string): string | undefined {
  const property = config.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      ts.isIdentifier(candidate.name) &&
      candidate.name.text === name,
  );
  return property && ts.isStringLiteral(property.initializer)
    ? property.initializer.text
    : undefined;
}

function limiterConfig(
  call: ts.CallExpression,
  nodes: ts.Node[],
): ts.ObjectLiteralExpression | undefined {
  const argument = call.arguments[0];
  if (argument && ts.isObjectLiteralExpression(argument)) return argument;
  if (!argument || !ts.isIdentifier(argument)) return undefined;
  const declaration = nodes.find(
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === argument.text &&
      Boolean(node.initializer && ts.isObjectLiteralExpression(node.initializer)),
  );
  return declaration?.initializer && ts.isObjectLiteralExpression(declaration.initializer)
    ? declaration.initializer
    : undefined;
}

test('all legacy authentication and public callers use typed fail-closed limiter decisions', () => {
  for (const file of LEGACY_PUBLIC_CALLERS) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const sourceNodes = [sourceFile, ...descendants(sourceFile)];
    const handler = auditedFunction(sourceFile, file);
    const nodes = [handler, ...descendants(handler)];
    const limiterImport = sourceNodes.find(
      (node): node is ts.ImportDeclaration =>
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === '@/lib/rate-limit',
    );
    assert.ok(limiterImport, `${file} must import the rate limiter`);

    const importedNames = limiterImport.importClause?.namedBindings;
    assert.ok(
      importedNames &&
        ts.isNamedImports(importedNames) &&
        importedNames.elements.some((element) => element.name.text === 'consumeRateLimitDecision'),
      `${file} must import consumeRateLimitDecision`,
    );
    assert.equal(
      sourceNodes.some((node) => isCallTo(node, 'consumeRateLimit')),
      false,
      `${file} must not call consumeRateLimit`,
    );

    const decisionCalls = nodes.filter((node) => isCallTo(node, 'consumeRateLimitDecision'));
    assert.ok(decisionCalls.length > 0, `${file} must call consumeRateLimitDecision`);
    for (const call of decisionCalls) {
      const config = limiterConfig(call, nodes);
      assert.ok(config, `${file} must pass a statically inspectable limiter config`);
      const fields = new Set(
        config.properties.flatMap((property) =>
          ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)
            ? [property.name.text]
            : ts.isShorthandPropertyAssignment(property)
              ? [property.name.text]
              : [],
        ),
      );
      assert.ok(fields.has('routeLabel'), `${file} must set routeLabel`);
      assert.ok(fields.has('correlationId'), `${file} must set correlationId`);

      const name = decisionName(call);
      assert.ok(name, `${file} must store each typed limiter decision`);
      const limitedBranch = branchForDecision(nodes, name, 'limited');
      assert.ok(limitedBranch, `${file} must handle limited for ${name}`);
      assert.ok(
        descendants(limitedBranch.thenStatement).some(
          (node) => ts.isNumericLiteral(node) && node.text === '429',
        ),
        `${file} must preserve its 429 response for ${name}`,
      );
      assert.ok(call.getStart() < limitedBranch.getStart(), `${file} must decide before 429`);

      const unavailableBranch = branchForDecision(nodes, name, 'unavailable');
      assert.ok(unavailableBranch, `${file} must handle unavailable for ${name}`);
      assert.ok(
        descendants(unavailableBranch.thenStatement).some(
          (node) => ts.isStringLiteral(node) && node.text === 'RATE_LIMIT_UNAVAILABLE',
        ) &&
          descendants(unavailableBranch.thenStatement).some(
            (node) => ts.isNumericLiteral(node) && node.text === '503',
          ),
        `${file} must return the stable unavailable error with status 503 for ${name}`,
      );
      assert.ok(call.getStart() < unavailableBranch.getStart(), `${file} must decide before 503`);
    }

    const prohibitedName = FIRST_PROHIBITED_CALL.get(file);
    if (prohibitedName) {
      const prohibitedCall = callMentioning(nodes, prohibitedName);
      assert.ok(prohibitedCall, `${file} must contain ${prohibitedName}`);
      const firstDecision = decisionCalls[0]!;
      const firstName = decisionName(firstDecision)!;
      const unavailableBranch = branchForDecision(nodes, firstName, 'unavailable')!;
      assert.ok(
        firstDecision.getStart() < prohibitedCall.getStart() &&
          unavailableBranch.end < prohibitedCall.getStart(),
        `${file} must deny unavailable before ${prohibitedName}`,
      );
    }

    const mfa = MFA_ROUTES.get(file);
    if (mfa) {
      assert.equal(decisionCalls.length, 2, `${file} must retain pre-auth and user limiter gates`);
      const providerCall = callMentioning(nodes, mfa.providerCall);
      const getUserCall = callMentioning(nodes, 'getUser');
      const csrfCall = callMentioning(nodes, 'guardCsrf');
      const csrfBranch = branchForIdentifier(nodes, 'csrfFail');
      const clientIpCall = callMentioning(nodes, 'getClientIp');
      assert.ok(providerCall && getUserCall, `${file} must authenticate after its pre-auth gate`);
      assert.ok(
        csrfCall && csrfBranch && clientIpCall,
        `${file} must guard CSRF and resolve client IP`,
      );
      const [preAuthDecision, userDecision] = decisionCalls;
      const preAuthConfig = limiterConfig(preAuthDecision!, nodes)!;
      const preAuthName = decisionName(preAuthDecision!)!;
      const preAuthLimited = branchForDecision(nodes, preAuthName, 'limited')!;
      const preAuthUnavailable = branchForDecision(nodes, preAuthName, 'unavailable')!;
      assert.equal(
        propertyLiteral(preAuthConfig, 'routeLabel'),
        mfa.preAuthLabel,
        `${file} must use its stable pre-auth route label`,
      );
      assert.match(preAuthConfig.getText(sourceFile), /RATE_LIMITS\.authPublicIp/u);
      assert.ok(
        preAuthConfig.getText(sourceFile).includes(`key: \`${mfa.keyPrefix}\${ip}\``),
        `${file} must key the pre-auth gate by client IP`,
      );
      assert.ok(
        csrfCall.getStart() < csrfBranch.getStart() &&
          csrfBranch.end < clientIpCall.getStart() &&
          clientIpCall.end < preAuthDecision!.getStart() &&
          preAuthDecision!.getStart() < preAuthLimited.getStart() &&
          preAuthLimited.end < providerCall.getStart() &&
          preAuthUnavailable.end < providerCall.getStart() &&
          providerCall.getStart() < getUserCall.getStart() &&
          getUserCall.end < userDecision!.getStart(),
        `${file} must pre-limit before auth and retain its post-auth user gate`,
      );
      const userConfig = limiterConfig(userDecision!, nodes)!;
      assert.match(userConfig.getText(sourceFile), /userData\.user\.id/u);
      assert.match(userConfig.getText(sourceFile), /RATE_LIMITS\.authedPerUser/u);
      assert.equal(propertyLiteral(userConfig, 'routeLabel'), mfa.userLabel);
      assert.match(preAuthConfig.getText(sourceFile), /correlationId/u);
      assert.match(userConfig.getText(sourceFile), /correlationId/u);
    }

    if (file === 'src/lib/data/erasure.ts') {
      assert.equal(decisionCalls.length, 2, 'erasure must retain user and IP limiter decisions');
      const providerCall = callMentioning(nodes, 'createSupabaseServiceRoleClient')!;
      const [userDecision, ipDecision] = decisionCalls;
      const userName = decisionName(userDecision!)!;
      const ipName = decisionName(ipDecision!)!;
      const userLimited = branchForDecision(nodes, userName, 'limited')!;
      const userUnavailable = branchForDecision(nodes, userName, 'unavailable')!;
      const ipLimited = branchForDecision(nodes, ipName, 'limited')!;
      const ipUnavailable = branchForDecision(nodes, ipName, 'unavailable')!;
      assert.ok(
        userDecision!.getStart() < userLimited.getStart() &&
          userLimited.end < userUnavailable.getStart() &&
          userUnavailable.end < ipDecision!.getStart() &&
          ipDecision!.getStart() < ipLimited.getStart() &&
          ipLimited.end < ipUnavailable.getStart() &&
          ipUnavailable.end < providerCall.getStart(),
        'erasure must fail closed at both limiter gates before service-role work',
      );
    }
  }
});
