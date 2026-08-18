import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { Answer, AnswerTable, Localized } from './localized';

// c1. Every string a driver can put in front of a player is either words the
// localizer produced (`Localized`) or a protocol value nobody translates
// (`Answer`). This walks the published types from the roots it derives below
// and reports any field that is a bare `string`, so adding an unbranded field
// to the surface fails here with nobody editing this file. It replaces sixteen
// `@ts-expect-error` lines that named fields one at a time and had missed seven
// of them.

// Where a driver lives. Everything under one of these that is not a test is a
// file whose output a person reads.
const DRIVERS = ['src/ui', 'scripts'];

// The roots are derived, not listed. "Published" has a mechanical definition and
// two halves: what a driver can hold is every type it imports from src/runtime,
// and what a driver publishes of its own is every type it declares that spells
// `Localized`. A hand-written root set was tried and is what this replaces — ten
// entries that had missed eleven imported types, which is the same failure as
// the sixteen `@ts-expect-error` lines c1 replaced and as `published()`'s dead
// id permissions in render.test.tsx. A list does not grow when the code does.
//
// So the only thing anybody maintains is what is *not* published, below, and a
// type nobody has ruled on is walked rather than skipped.
function derivedRoots(): Array<{ file: string; type: string }> {
  const roots = new Map<string, { file: string; type: string }>();
  const add = (file: string, type: string): void => {
    // A brand is the ruler this check is written in rather than something it
    // measures: `Localized` is a branded `string` and would report itself.
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

// A declaration the walk does not look inside, wherever it reaches one. This is
// the whole of what is hand-maintained about the root set, and each entry is a
// value a person never reads: a function, a protocol, or a handle whose own
// published values are reached without it. The authoring tool's English is not
// here — c4 declares that at the type, with `words: 'tool'`, which is read below
// rather than restated as names.
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
];

const UNPUBLISHED = new Set(NOT_PUBLISHED.map((each) => each.type));

// c4's discriminant, read rather than restated: an arm or a line that says its
// words are the tool's carries the tool's own English by declaration, and the
// walk stops at it wherever it is reached from. That is what keeps
// `CommandOutput` and `CommandResult` walkable roots while `ToolMessage`,
// `ToolLine` and the three arms carrying raw DSL are passed over.
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

// Where the walk crosses out of src/runtime, and what its strings are there.
// The layer order puts `Localized` above `src/content` and `src/grammar`, so a
// field either declares cannot carry the brand and this check cannot ask it to.
// Listing the field rather than the type keeps the exception to what was read:
// a second string on the same type still fails.
const BELOW_THE_BRAND: ReadonlyArray<{ field: string; why: string }> = [
  { field: 'ClusterEffect.statId', why: 'a stat id, declared by `ClusterEffect` in src/content/item.ts, which sits under the layer that declares the brand' },
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

// The one way to publish a map keyed by an id: a declaration at the field that
// nothing in it is words. Its value is read here rather than walked, so the
// declaration cannot be made and then contradicted.
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

// Whether a type node is one of the two brands, followed through the imports the
// way a named type is. Written against the resolved declaration rather than the
// spelling, so an alias of `Answer` is one.
function isBrand(node: ts.TypeNode, file: string, brand: string): boolean {
  if (!ts.isTypeReferenceNode(node) || !ts.isIdentifier(node.typeName)) return false;
  const name = node.typeName.text;
  if (name === brand) return true;
  const found = declarationOf(file, name);
  return found !== undefined && ts.isTypeAliasDeclaration(found.statement) && isBrand(found.statement.type, found.file, brand);
}

interface Walk {
  readonly offenders: string[];
  // A published field that is a map keyed by an `Answer` and has not declared
  // itself an `AnswerTable`.
  readonly dictionaries: string[];
  // A node kind the walk does not know how to read is reported rather than
  // passed over, because a check that silently skips what it cannot parse
  // reports nothing and reads as though it covered everything.
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
  // A call is not a published value: what it answers is, and the answer is a
  // type of its own that this walk reaches wherever it is published.
  if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) return;
  if (ts.isTypeLiteralNode(node)) return speaksForTheTool(node.members) ? undefined : walkMembers(node.members, file, where, walk);
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
  if (name === ANSWER_TABLE && args?.length === 1) return walkTableValue(args[0], where, walk);
  if (name === 'Record' && args?.length === 2) {
    // c10. A `Record` keyed by an `Answer` is a dictionary a driver holds ids
    // in and has no words for, and the walk below is structurally blind to it
    // because a key is not a field — which is how `stats`, `xp` and `equipment`
    // sat on the published surface through seven passes of the rule that they
    // broke. What is genuinely protocol on both sides says so at the field, by
    // being an `AnswerTable`.
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

  // A derivation that found nothing would leave every assertion below green
  // over an empty walk, which is the failure mode a hand-written list has by
  // construction and this one has to be checked for.
  it('derives a root set that reaches the surface both drivers draw', () => {
    const named = new Set(roots.map((root) => `${root.file}#${root.type}`));

    expect([...named].filter((root) => UNPUBLISHED.has(root)).sort()).toEqual([...UNPUBLISHED].sort());
    for (const reached of ['src/runtime/session.ts#PlayView', 'src/runtime/save.ts#PruneWarning', 'src/ui/sheet.ts#Entry', 'scripts/planeView.ts#PlaneLines']) {
      expect(named, `${reached} is published and the derivation missed it`).toContain(reached);
    }
  });

  it('reads every type it reaches, rather than passing over what it cannot parse', () => {
    expect(walk.unread).toEqual([]);
  });

  // c10's enforcement. A key is not a field, so nothing above this line looks
  // at one, and three published dictionaries a driver drew ids out of survived
  // every pass of the rule they broke.
  it('publishes no map keyed by an id that has not said nothing in it is words', () => {
    expect([...walk.dictionaries].sort()).toEqual([]);
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

// The same for c10: the shape `stats` had, a table that keeps its word, and a
// table that declared nothing in it is words and then held some.
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
