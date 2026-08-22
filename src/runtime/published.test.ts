import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { Answer, AnswerTable, Localized } from './localized';

const DRIVERS = ['src/ui', 'scripts'];

function derivedRoots(): Array<{ file: string; type: string }> {
  const roots = new Map<string, { file: string; type: string }>();
  const add = (file: string, type: string): void => {
    if (BRANDS.has(type)) return;
    const found = declarationOf(file, type);
    if (found) roots.set(`${found.file}#${type}`, { file: found.file, type });
  };
  for (const directory of DRIVERS) {
    for (const file of sourceFiles(directory)) {
      const module = moduleAt(file);
      for (const brought of module.imported.values()) if (brought.file.startsWith(`${RUNTIME}/`)) add(brought.file, brought.exported);
      for (const [name, statement] of module.declared) if (/\bLocalized\b/.test(statement.getText())) add(file, name);
    }
  }
  return [...roots.values()].sort((left, right) => `${left.file}#${left.type}`.localeCompare(`${right.file}#${right.type}`));
}

const NOT_PUBLISHED: ReadonlyArray<{ type: string; why: string }> = [
  { type: 'src/runtime/localized.ts#Params', why: 'the bag a call site hands the localizer, keyed by the parameter names a pattern spells. It goes into a render and never comes out of one' },
  { type: 'src/runtime/command.ts#Recorder', why: 'the replay log: directive lines and the save bytes a replay starts from, which is the protocol a `# test` is written in' },
  { type: 'src/runtime/command.ts#AuthoringContext', why: 'the module sources an authoring command edits. Their text is DSL, which is `src/content`\'s and is drawn as a tool line where it is drawn at all' },
  { type: 'src/runtime/command.ts#CommandContext', why: 'the handle a driver runs a line through — a session, a recorder and two dials. Every value it publishes reaches this walk on its own: the view as `PlayView`, the answer as `CommandResult`' },
  { type: 'src/runtime/command.ts#CommandHelp', why: "the command table, whose name, aliases and summary are the tool's own English (c4): both drivers print one as a tool line, and the `help` arm that carries it says so" },
  {
    type: 'src/runtime/openUniverse.ts#OpenedUniverse',
    why: 'the handle a driver opens through — a session, the module ids that loaded and what is wrong with them. Its problems reach this walk on their own, as `UniverseProblem`, which declares the tool as whose words they are; the session it holds reaches a driver as `CommandContext` does and is passed over for the same reason',
  },
  {
    type: 'src/runtime/session.ts#PlaySession',
    why: 'the live session a driver threads through `apply`/`applyDirective`/`view`. Everything it publishes reaches this walk on its own — the view as `PlayView`, the status as `PlayStatus` — and its own `registry` field is content the walk is not about, for the same reason `OpenedUniverse.session` is passed over',
  },
];

const UNPUBLISHED = new Set(NOT_PUBLISHED.map((each) => each.type));

function speaksForTheTool(members: ts.NodeArray<ts.TypeElement>): boolean {
  return members.some(
    (member) =>
      ts.isPropertySignature(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'words' &&
      member.type !== undefined &&
      ts.isLiteralTypeNode(member.type) &&
      ts.isStringLiteral(member.type.literal) &&
      member.type.literal.text === 'tool',
  );
}

const BELOW_THE_BRAND: ReadonlyArray<{ field: string; why: string }> = [
  { field: 'ClusterEffect.statId', why: 'a stat id, declared by `ClusterEffect` in src/content/item.ts, which sits under the layer that declares the brand' },
];

const EN_ROUTE: ReadonlyArray<{ type: string; why: string }> = [
  { type: 'src/runtime/state.ts#GameState', why: '`log` is what a view drains into `said`, held on the state because a line is written before anyone reads it' },
  { type: 'src/runtime/planeScreen.ts#PlaneMove', why: 'the value and the words for it that become one `ModalChoice`' },
];

const RUNTIME = 'src/runtime';

const BRANDS = new Set(['Localized', 'Answer']);

const CONTAINERS = new Set(['Array', 'ReadonlyArray', 'Readonly', 'Record', 'Partial', 'Required', 'NonNullable', 'Exclude', 'Extract', 'Omit', 'Pick']);

interface Import {
  readonly file: string;
  readonly exported: string;
}

interface Module {
  readonly declared: ReadonlyMap<string, ts.Statement>;
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

const ANSWER_TABLE = 'AnswerTable';

const TABLE_VALUES = new Set([ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BooleanKeyword]);

function walkTableValue(node: ts.TypeNode, where: string, walk: Walk): void {
  if (ts.isUnionTypeNode(node)) {
    for (const each of node.types) walkTableValue(each, where, walk);
    return;
  }
  const named = ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) ? node.typeName.text : undefined;
  if (named === 'Answer' || TABLE_VALUES.has(node.kind)) return;
  walk.offenders.push(`${where}{}`);
}

function isBrand(node: ts.TypeNode, file: string, brand: string): boolean {
  if (!ts.isTypeReferenceNode(node) || !ts.isIdentifier(node.typeName)) return false;
  const name = node.typeName.text;
  if (name === brand) return true;
  const found = declarationOf(file, name);
  return found !== undefined && ts.isTypeAliasDeclaration(found.statement) && isBrand(found.statement.type, found.file, brand);
}

interface Walk {
  readonly offenders: string[];
  readonly dictionaries: string[];
  readonly unread: string[];
  readonly reached: Set<string>;
}

const emptyWalk = (): Walk => ({ offenders: [], dictionaries: [], unread: [], reached: new Set() });

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
  if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) return;
  if (ts.isTypeLiteralNode(node)) return speaksForTheTool(node.members) ? undefined : walkMembers(node.members, file, where, walk);
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) return walkReference(node.typeName.text, node.typeArguments, file, where, walk);
  if (ts.isIndexedAccessTypeNode(node)) return walkIndexedAccess(node, file, where, walk);

  walk.unread.push(`${where}: ${ts.SyntaxKind[node.kind]}`);
}

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
  if (name === ANSWER_TABLE && args?.length === 1) return walkTableValue(args[0], where, walk);
  if (name === 'Record' && args?.length === 2) {
    if (isBrand(args[0], file, 'Answer')) walk.dictionaries.push(where);
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
  if (UNPUBLISHED.has(seen)) return;
  if (walk.reached.has(seen)) return;
  walk.reached.add(seen);

  const { statement } = found;
  if (ts.isEnumDeclaration(statement)) return;
  if (ts.isTypeAliasDeclaration(statement)) return walkType(statement.type, found.file, name, walk);
  if (!ts.isInterfaceDeclaration(statement)) return;
  if (speaksForTheTool(statement.members)) return;
  for (const clause of statement.heritageClauses ?? []) {
    for (const parent of clause.types) if (ts.isIdentifier(parent.expression)) walkNamed(parent.expression.text, found.file, name, walk);
  }
  walkMembers(statement.members, found.file, name, walk);
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
    if (ts.isMethodSignature(member)) continue;
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
  const roots = derivedRoots();
  const walk = walkRoots(roots);

  it('derives a root set that reaches the surface both drivers draw', () => {
    const named = new Set(roots.map((root) => `${root.file}#${root.type}`));

    expect([...named].filter((root) => UNPUBLISHED.has(root)).sort()).toEqual([...UNPUBLISHED].sort());
    for (const reached of ['src/runtime/session.ts#PlayView', 'src/runtime/pruning.ts#PruneWarning', 'src/ui/sheet.ts#Entry', 'scripts/planeView.ts#PlaneLines']) {
      expect(named, `${reached} is published and the derivation missed it`).toContain(reached);
    }
  });

  it('reads every type it reaches, rather than passing over what it cannot parse', () => {
    expect(walk.unread).toEqual([]);
  });

  it('publishes no map keyed by an id that has not said nothing in it is words', () => {
    expect([...walk.dictionaries].sort()).toEqual([]);
  });

  it('leaves no field on the published surface a bare string', () => {
    expect([...walk.offenders].sort()).toEqual(BELOW_THE_BRAND.map((crossing) => crossing.field).sort());
  });

  it('reaches every type holding a Localized that is not on its way to one', () => {
    const holders = sourceFiles(RUNTIME).flatMap((file) =>
      [...moduleAt(file).declared.entries()].flatMap(([name, statement]) => (ts.isInterfaceDeclaration(statement) && statement.members.some((member) => ts.isPropertySignature(member) && /\bLocalized\b/.test(member.type?.getText() ?? '')) ? [`${file}#${name}`] : [])),
    );

    expect(holders.filter((holder) => !walk.reached.has(holder)).sort()).toEqual(EN_ROUTE.map((held) => held.type).sort());
  });
});

export interface UnbrandedFixture {
  readonly words: Localized;
  readonly title: string;
  readonly rows: ReadonlyArray<{ readonly id: string; readonly count: number }>;
  readonly under: Record<string, string>;
}

export interface DictionaryFixture {
  readonly counted: Record<Answer, number>;
  readonly held: AnswerTable<Answer>;
  readonly switches: AnswerTable<boolean | number>;
  readonly named: AnswerTable<Localized>;
}

describe('the walk reports what it is looking for', () => {
  it('names every bare string under a root and nothing else', () => {
    const walk = walkRoots([{ file: 'src/runtime/published.test.ts', type: 'UnbrandedFixture' }]);

    expect(walk.offenders).toEqual(['UnbrandedFixture.title', 'UnbrandedFixture.rows[].id', 'UnbrandedFixture.under{key}', 'UnbrandedFixture.under{}']);
    expect(walk.dictionaries).toEqual([]);
    expect(walk.unread).toEqual([]);
  });

  it('names every published map keyed by an id, and every word smuggled into one', () => {
    const walk = walkRoots([{ file: 'src/runtime/published.test.ts', type: 'DictionaryFixture' }]);

    expect(walk.dictionaries).toEqual(['DictionaryFixture.counted']);
    expect(walk.offenders).toEqual(['DictionaryFixture.named{}']);
    expect(walk.unread).toEqual([]);
  });
});
