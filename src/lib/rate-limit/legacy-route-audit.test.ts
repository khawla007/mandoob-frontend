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

function branchForLiteral(sourceFile: ts.SourceFile, literal: 'limited' | 'unavailable') {
  return descendants(sourceFile).find(
    (node): node is ts.IfStatement =>
      ts.isIfStatement(node) &&
      descendants(node.expression).some(
        (child) => ts.isStringLiteral(child) && child.text === literal,
      ),
  );
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
    const nodes = [sourceFile, ...descendants(sourceFile)];
    const limiterImport = nodes.find(
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
      nodes.some((node) => isCallTo(node, 'consumeRateLimit')),
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
    }

    const limitedBranch = branchForLiteral(sourceFile, 'limited');
    assert.ok(limitedBranch, `${file} must handle the literal limited decision`);
    assert.ok(
      descendants(limitedBranch.thenStatement).some(
        (node) => ts.isNumericLiteral(node) && node.text === '429',
      ),
      `${file} must preserve its 429 response`,
    );

    const unavailableBranch = branchForLiteral(sourceFile, 'unavailable');
    assert.ok(unavailableBranch, `${file} must handle the literal unavailable decision`);
    assert.ok(
      descendants(unavailableBranch.thenStatement).some(
        (node) => ts.isStringLiteral(node) && node.text === 'RATE_LIMIT_UNAVAILABLE',
      ) &&
        descendants(unavailableBranch.thenStatement).some(
          (node) => ts.isNumericLiteral(node) && node.text === '503',
        ),
      `${file} must return the stable unavailable error with status 503`,
    );
  }
});
