import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { Localized } from './localized';

// c1. Every string a driver can put in front of a player is either words the
// localizer produced (`Localized`) or a protocol value nobody translates
// (`Answer`). This walks the published types from the roots below and reports
// any field that is a bare `string`, so adding an unbranded field to the
// surface fails here with nobody editing this file. It replaces sixteen
// `@ts-expect-error` lines that named fields one at a time and had missed seven
// of them.

// The roots are the residue: a new field is free, a new root is a line here.
// Each is a value that leaves src/runtime without another published type
// carrying it.
const ROOTS: ReadonlyArray<{ file: string; type: string; why: string }> = [
  { file: 'src/runtime/session.ts', type: 'PlayView', why: 'the whole of what a driver renders a turn from, and what every screen reads' },
  { file: 'src/runtime/save.ts', type: 'PruneWarning', why: 'what a load reports about content that has gone, reaching the player through a driver rather than through the view' },
];

// Where the walk crosses out of src/runtime, and what its strings are there.
// The layer order puts `Localized` above `src/content` and `src/grammar`, so a
// field either declares cannot carry the brand and this check cannot ask it to.
// Listing the field rather than the type keeps the exception to what was read:
// a second string on the same type still fails.
const BELOW_THE_BRAND: ReadonlyArray<{ field: string; why: string }> = [
  { field: 'PlayView.planes[].clusters[].effects[].effect.statId', why: 'a stat id, declared by `ClusterEffect` in src/content/item.ts, which sits under the layer that declares the brand' },
];

// A runtime type holding a `Localized` that no root reaches, and where the
// value it holds is going. Each is a line the guard below forces somebody to
// write, which is what makes a root nobody named show up as one of these
// rather than as silence.
const EN_ROUTE: ReadonlyArray<{ type: string; why: string }> = [
  { type: 'src/runtime/state.ts#GameState', why: '`log` is what a view drains into `said`, held on the state because a line is written before anyone reads it' },
  { type: 'src/runtime/planeScreen.ts#PlaneMove', why: 'the value and the words for it that become one `ModalChoice`' },
];

const RUNTIME = 'src/runtime';

// A type name a published field may hold and the walk does not look past: the
// two halves of what a published string is.
const BRANDS = new Set(['Localized', 'Answer']);

// Generic shapes with no declaration of their own to walk. Every one of them is
// a container: what it holds is what matters, and `Record`'s key is walked with
// its value because an id is as much a published string as anything else.
const CONTAINERS = new Set(['Array', 'ReadonlyArray', 'Readonly', 'Record', 'Partial', 'Required', 'NonNullable', 'Exclude', 'Extract', 'Omit', 'Pick']);

interface Import {
  readonly file: string;
  readonly exported: string;
}

interface Module {
  readonly declared: ReadonlyMap<string, ts.Statement>;
  // A name this file does not declare, and the file it comes from — an import
  // and a re-export are the same fact to a reader following a name home.
  readonly imported: ReadonlyMap<string, Import>;
  readonly values: ReadonlyMap<string, ts.VariableDeclaration>;
}

const modules = new Map<string, Module>();

function moduleAt(file: string): Module {
  const cached = modules.get(file);
  if (cached) return cached;

  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const declared = new Map<string, ts.Statement>();
  const imported = new Map<string, Import>();
  const values = new Map<string, ts.VariableDeclaration>();
  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) declared.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) values.set(declaration.name.text, declaration);
    }
    const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : ts.isExportDeclaration(statement) ? statement.exportClause : undefined;
    const specifier = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
    if (!bindings || !specifier || !ts.isStringLiteral(specifier)) continue;
    const from = moduleFile(file, specifier.text);
    if (!from) continue;
    if (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) {
      for (const element of bindings.elements) imported.set(element.name.text, { file: from, exported: (element.propertyName ?? element.name).text });
    }
  }

  const module: Module = { declared, imported, values };
  modules.set(file, module);
  return module;
}

function moduleFile(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.posix.join(path.posix.dirname(from), specifier);
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) => existsSync(candidate));
}

function declarationOf(file: string, name: string): { file: string; statement: ts.Statement } | undefined {
  const module = moduleAt(file);
  const local = module.declared.get(name);
  if (local) return { file, statement: local };
  const brought = module.imported.get(name);
  return brought ? declarationOf(brought.file, brought.exported) : undefined;
}

interface Walk {
  readonly offenders: string[];
  // A node kind the walk does not know how to read is reported rather than
  // passed over, because a check that silently skips what it cannot parse
  // reports nothing and reads as though it covered everything.
  readonly unread: string[];
  readonly reached: Set<string>;
}

const emptyWalk = (): Walk => ({ offenders: [], unread: [], reached: new Set() });

function walkType(node: ts.TypeNode, file: string, where: string, walk: Walk): void {
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      walk.offenders.push(where);
      return;
    case ts.SyntaxKind.NumberKeyword:
    case ts.SyntaxKind.BooleanKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.NeverKeyword:
    case ts.SyntaxKind.LiteralType:
      return;
  }

  if (ts.isParenthesizedTypeNode(node)) return walkType(node.type, file, where, walk);
  if (ts.isTypeOperatorNode(node)) return walkType(node.type, file, where, walk);
  if (ts.isArrayTypeNode(node)) return walkType(node.elementType, file, `${where}[]`, walk);
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    for (const each of node.types) walkType(each, file, where, walk);
    return;
  }
  if (ts.isTupleTypeNode(node)) {
    for (const each of node.elements) walkType(each, file, `${where}[]`, walk);
    return;
  }
  if (ts.isTypeLiteralNode(node)) return walkMembers(node.members, file, where, walk);
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) return walkReference(node.typeName.text, node.typeArguments, file, where, walk);
  if (ts.isIndexedAccessTypeNode(node)) return walkIndexedAccess(node, file, where, walk);

  walk.unread.push(`${where}: ${ts.SyntaxKind[node.kind]}`);
}

// `(typeof DIRECTIONS)[number]`: a vocabulary spelled once as a value and read
// back as the type of its members. It is as closed as a union of literals, and
// a published field holds one, so it is read here rather than passed over.
function walkIndexedAccess(node: ts.IndexedAccessTypeNode, file: string, where: string, walk: Walk): void {
  const object = ts.isParenthesizedTypeNode(node.objectType) ? node.objectType.type : node.objectType;
  if (node.indexType.kind === ts.SyntaxKind.NumberKeyword && ts.isTypeQueryNode(object) && ts.isIdentifier(object.exprName)) {
    const listed = constantList(object.exprName.text, file);
    if (listed?.every((element) => ts.isStringLiteral(element))) return;
  }
  walk.unread.push(`${where}: ${ts.SyntaxKind[node.kind]}`);
}

function constantList(name: string, file: string): ts.NodeArray<ts.Expression> | undefined {
  const module = moduleAt(file);
  const local = module.values.get(name);
  if (!local) {
    const brought = module.imported.get(name);
    return brought ? constantList(brought.exported, brought.file) : undefined;
  }
  const listed = local.initializer && ts.isAsExpression(local.initializer) ? local.initializer.expression : local.initializer;
  return listed && ts.isArrayLiteralExpression(listed) ? listed.elements : undefined;
}

function walkReference(name: string, args: ts.NodeArray<ts.TypeNode> | undefined, file: string, where: string, walk: Walk): void {
  if (BRANDS.has(name)) return;
  if (name === 'Record' && args?.length === 2) {
    walkType(args[0], file, `${where}{key}`, walk);
    walkType(args[1], file, `${where}{}`, walk);
    return;
  }
  if (CONTAINERS.has(name)) {
    for (const argument of args ?? []) walkType(argument, file, name === 'Array' || name === 'ReadonlyArray' ? `${where}[]` : where, walk);
    return;
  }
  walkNamed(name, file, where, walk);
}

function walkNamed(name: string, file: string, where: string, walk: Walk): void {
  const found = declarationOf(file, name);
  if (!found) {
    walk.unread.push(`${where}: ${name} resolves to no declaration under src/`);
    return;
  }

  const seen = `${found.file}#${name}`;
  if (walk.reached.has(seen)) return;
  walk.reached.add(seen);

  const { statement } = found;
  if (ts.isEnumDeclaration(statement)) return;
  if (ts.isTypeAliasDeclaration(statement)) return walkType(statement.type, found.file, where, walk);
  if (!ts.isInterfaceDeclaration(statement)) return;
  for (const clause of statement.heritageClauses ?? []) {
    for (const parent of clause.types) if (ts.isIdentifier(parent.expression)) walkNamed(parent.expression.text, found.file, where, walk);
  }
  walkMembers(statement.members, found.file, where, walk);
}

function walkMembers(members: ts.NodeArray<ts.TypeElement>, file: string, where: string, walk: Walk): void {
  for (const member of members) {
    if (ts.isPropertySignature(member) && member.type && ts.isIdentifier(member.name)) {
      walkType(member.type, file, `${where}.${member.name.text}`, walk);
      continue;
    }
    if (ts.isIndexSignatureDeclaration(member)) {
      const key = member.parameters[0]?.type;
      if (key) walkType(key, file, `${where}{key}`, walk);
      walkType(member.type, file, `${where}{}`, walk);
      continue;
    }
    walk.unread.push(`${where}: ${ts.SyntaxKind[member.kind]}`);
  }
}

function walkRoots(roots: ReadonlyArray<{ file: string; type: string }>): Walk {
  const walk = emptyWalk();
  for (const root of roots) walkNamed(root.type, root.file, root.type, walk);
  return walk;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.posix.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('every published string says which of the two it is (c1)', () => {
  const walk = walkRoots(ROOTS);

  it('resolves every root it names', () => {
    expect(ROOTS.filter((root) => !declarationOf(root.file, root.type)).map((root) => `${root.file}#${root.type}`)).toEqual([]);
  });

  it('reads every type it reaches, rather than passing over what it cannot parse', () => {
    expect(walk.unread).toEqual([]);
  });

  it('leaves no field on the published surface a bare string', () => {
    expect([...walk.offenders].sort()).toEqual(BELOW_THE_BRAND.map((crossing) => crossing.field).sort());
  });

  // The check on the root set itself. A missing root leaves the walk green over
  // nothing, and no assertion about the offenders it found can tell that apart
  // from a clean surface. A `Localized` is made to be read, so a type holding
  // one that no root reaches is either a root nobody named or a value on its
  // way to one — and which of the two it is has to be said.
  it('reaches every type holding a Localized that is not on its way to one', () => {
    const holders = sourceFiles(RUNTIME).flatMap((file) =>
      [...moduleAt(file).declared.entries()].flatMap(([name, statement]) => (ts.isInterfaceDeclaration(statement) && statement.members.some((member) => ts.isPropertySignature(member) && /\bLocalized\b/.test(member.type?.getText() ?? '')) ? [`${file}#${name}`] : [])),
    );

    expect(holders.filter((holder) => !walk.reached.has(holder)).sort()).toEqual(EN_ROUTE.map((held) => held.type).sort());
  });
});

// The check's own proof that it can fail, walked the same way the surface is.
// Exported because a fixture nothing reads is a fixture tsc deletes.
export interface UnbrandedFixture {
  readonly words: Localized;
  readonly title: string;
  readonly rows: ReadonlyArray<{ readonly id: string; readonly count: number }>;
  readonly under: Record<string, string>;
}

describe('the walk reports what it is looking for', () => {
  it('names every bare string under a root and nothing else', () => {
    const walk = walkRoots([{ file: 'src/runtime/published.test.ts', type: 'UnbrandedFixture' }]);

    expect(walk.offenders).toEqual(['UnbrandedFixture.title', 'UnbrandedFixture.rows[].id', 'UnbrandedFixture.under{key}', 'UnbrandedFixture.under{}']);
    expect(walk.unread).toEqual([]);
  });
});
