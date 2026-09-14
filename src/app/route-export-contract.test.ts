import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import ts from 'typescript';

const allowedRouteExports = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'generateStaticParams',
]);

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectRouteFiles(entryPath);
    }

    return entry.isFile() && entry.name === 'route.ts' ? [entryPath] : [];
  });
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function hasDefaultModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
  );
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }

  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
  );
}

function exportedNames(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements.flatMap((statement): string[] => {
    if (ts.isExportAssignment(statement)) {
      return ['default'];
    }

    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) {
        return ['*'];
      }

      if (ts.isNamedExports(statement.exportClause)) {
        return statement.exportClause.elements.map((element) => element.name.text);
      }

      return [statement.exportClause.name.text];
    }

    if (!hasExportModifier(statement)) {
      return [];
    }

    if (hasDefaultModifier(statement)) {
      return ['default'];
    }

    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) =>
        bindingNames(declaration.name),
      );
    }

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      return [statement.name.text];
    }

    return [];
  });
}

test('App route modules export only Next.js route fields and HTTP methods', () => {
  const appDirectory = path.join(process.cwd(), 'src', 'app');
  const routeFiles = collectRouteFiles(appDirectory).sort();
  const unexpected = routeFiles.flatMap((filePath) => {
    const sourceFile = ts.createSourceFile(
      filePath,
      readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const relativePath = path.relative(process.cwd(), filePath);

    return exportedNames(sourceFile)
      .filter((name) => !allowedRouteExports.has(name))
      .map((name) => `${relativePath}: ${name}`);
  });

  assert.ok(routeFiles.length > 0, 'expected to discover App Router route modules');
  assert.deepEqual(unexpected, []);
});
