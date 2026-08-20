import ts from 'typescript';

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((m) => m.kind === kind));
}

function isAsyncFunction(node: ts.Node): boolean {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)) &&
    hasModifier(node, ts.SyntaxKind.AsyncKeyword)
  );
}

function variableRuntimeKind(declaration: ts.VariableDeclaration): 'async' | 'function' | 'value' {
  const initializer = declaration.initializer;
  if (initializer && isAsyncFunction(initializer)) return 'async';
  if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
    return 'function';
  }
  return 'value';
}

export function auditUseServerRuntimeExports(source: string): string[] {
  const file = ts.createSourceFile(
    'actions.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const isUseServer = file.statements.some(
    (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text === 'use server',
  );
  if (!isUseServer) return [];

  const localRuntime = new Map<string, 'async' | 'function' | 'value' | 'type'>();
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      localRuntime.set(statement.name.text, isAsyncFunction(statement) ? 'async' : 'function');
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          localRuntime.set(declaration.name.text, variableRuntimeKind(declaration));
        }
      }
    } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      localRuntime.set(statement.name.text, 'type');
    } else if (
      (ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      localRuntime.set(statement.name.text, 'value');
    }
  }

  const violations: string[] = [];
  for (const statement of file.statements) {
    if (ts.isExportAssignment(statement)) {
      if (isAsyncFunction(statement.expression)) continue;
      if (
        ts.isArrowFunction(statement.expression) ||
        ts.isFunctionExpression(statement.expression)
      ) {
        violations.push('default non-async function is exported');
      } else {
        violations.push('default exported value is not an async function');
      }
      continue;
    }
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      if (ts.isFunctionDeclaration(statement)) {
        if (!isAsyncFunction(statement)) violations.push('default non-async function is exported');
      } else if (ts.isClassDeclaration(statement)) {
        violations.push('default exported class is not an async function');
      } else {
        violations.push('default exported value is not an async function');
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      if (statement.moduleSpecifier) {
        if (
          statement.exportClause &&
          ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.every((element) => element.isTypeOnly)
        ) {
          continue;
        }
        violations.push('runtime re-export is not allowed in a use-server module');
        continue;
      }
      if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        violations.push('runtime re-export is not allowed in a use-server module');
        continue;
      }
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const localName = (element.propertyName ?? element.name).text;
        const kind = localRuntime.get(localName);
        if (kind !== 'async' && kind !== 'type') {
          violations.push(`runtime export list exposes ${localName}`);
        }
      }
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
    if (ts.isFunctionDeclaration(statement)) {
      if (!isAsyncFunction(statement)) violations.push('non-async function is exported');
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = ts.isIdentifier(declaration.name) ? declaration.name.text : 'binding';
        const kind = variableRuntimeKind(declaration);
        if (kind === 'function') violations.push(`non-async function ${name} is exported`);
        else if (kind === 'value') violations.push(`${name} is an exported value`);
      }
      continue;
    }
    if (ts.isEnumDeclaration(statement)) {
      violations.push(`enum ${statement.name.text} is exported`);
      continue;
    }
    if (ts.isClassDeclaration(statement)) {
      violations.push(`class ${statement.name?.text ?? 'anonymous'} is exported`);
      continue;
    }
    violations.push(`unsupported runtime export: ${ts.SyntaxKind[statement.kind]}`);
  }
  return violations;
}
