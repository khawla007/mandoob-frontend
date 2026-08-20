import ts from 'typescript';

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((m) => m.kind === kind));
}

function createAuditProgram(source: string): { checker: ts.TypeChecker; file: ts.SourceFile } {
  const fileName = '/__use_server_audit__/actions.ts';
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (requestedName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (requestedName === fileName) {
      return ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile(
      requestedName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    );
  };
  host.fileExists = (requestedName) =>
    requestedName === fileName || ts.sys.fileExists(requestedName);
  host.readFile = (requestedName) =>
    requestedName === fileName ? source : ts.sys.readFile(requestedName);

  const program = ts.createProgram([fileName], options, host);
  const file = program.getSourceFile(fileName);
  if (!file) throw new Error('Failed to create use-server audit source file');
  return { checker: program.getTypeChecker(), file };
}

function isCallable(checker: ts.TypeChecker, node: ts.Node): boolean {
  return (
    checker.getSignaturesOfType(checker.getTypeAtLocation(node), ts.SignatureKind.Call).length > 0
  );
}

// Mirrors Next 16.2.12's server-boundary isPromiseType predicate.
function isNextPromiseType(checker: ts.TypeChecker, type: ts.Type): boolean {
  const typeReference = type as ts.TypeReference;
  if (!typeReference.target) return false;
  return /^Promise(<.+>)?$/.test(checker.typeToString(typeReference.target));
}

// Mirrors Next 16.2.12's server-boundary isFunctionReturningPromise predicate.
function isPromiseReturningCallable(checker: ts.TypeChecker, node: ts.Node): boolean {
  const type = checker.getTypeAtLocation(node);
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  let isPromise = true;
  if (signatures.length) {
    for (const signature of signatures) {
      const returnType = signature.getReturnType();
      if (returnType.isUnion()) {
        for (const constituent of returnType.types) {
          if (!isNextPromiseType(checker, constituent)) {
            isPromise = false;
            break;
          }
        }
      } else {
        isPromise = isNextPromiseType(checker, returnType);
      }
    }
  } else {
    isPromise = false;
  }
  return isPromise;
}

function exportViolation(
  checker: ts.TypeChecker,
  node: ts.Node,
  callableMessage: string,
  valueMessage: string,
): string | undefined {
  if (isPromiseReturningCallable(checker, node)) return undefined;
  return isCallable(checker, node) ? callableMessage : valueMessage;
}

export function auditUseServerRuntimeExports(source: string): string[] {
  const { checker, file } = createAuditProgram(source);
  let isUseServer = false;
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === 'use server') isUseServer = true;
  }
  if (!isUseServer) return [];

  const violations: string[] = [];
  for (const statement of file.statements) {
    if (ts.isExportAssignment(statement)) {
      const violation = exportViolation(
        checker,
        statement.expression,
        'default non-async function does not return Promise',
        'default exported value is not a Promise-returning callable',
      );
      if (violation) violations.push(violation);
      continue;
    }

    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      if (ts.isClassDeclaration(statement)) {
        violations.push('default exported class is not a Promise-returning callable');
      } else {
        const violation = exportViolation(
          checker,
          statement,
          'default non-async function does not return Promise',
          'default exported value is not a Promise-returning callable',
        );
        if (violation) violations.push(violation);
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
        const violation = exportViolation(
          checker,
          element.propertyName ?? element.name,
          `runtime export list exposes ${localName}: callable does not return Promise`,
          `runtime export list exposes ${localName}: value is not callable`,
        );
        if (violation) violations.push(violation);
      }
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
    if (ts.isFunctionDeclaration(statement)) {
      const violation = exportViolation(
        checker,
        statement,
        'non-async function does not return Promise',
        'exported function is not callable',
      );
      if (violation) violations.push(violation);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = ts.isIdentifier(declaration.name) ? declaration.name.text : 'binding';
        const violation = exportViolation(
          checker,
          declaration.name,
          `non-async function ${name} does not return Promise`,
          `${name} is an exported value, not a Promise-returning callable`,
        );
        if (violation) violations.push(violation);
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
