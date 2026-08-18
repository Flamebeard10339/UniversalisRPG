import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { TestState } from './agent/testHarness';
import type { Driver, DriverSnapshot } from './driver';

// What this layer publishes, held to saying what is true — asked of the type
// rather than of one field at a time, so `| null`, `| undefined` and `?:` are
// one question over every key including the ones written next month, and asked
// of the shape rather than of the text, so neither a rename nor a line break
// defeats it.

// What a member yields when it is called, and the member itself when it is not:
// `serialized(): string | null` publishes a nothing exactly as `speed: number |
// null` does, and a rule that read only the property type would see a function
// and stop. One level, because a method returning a localizer publishes a
// localizer and what the localizer then returns is that module's promise.
type Yielded<V> = [V] extends [(...args: never[]) => infer R] ? R : V;

// A member that admits nothing. `void` is not an absence: it is the answer of
// something asked to do rather than to say, and every command on the driver has
// it.
type Absent<V> = [Yielded<V>] extends [void] ? false : [null] extends [Yielded<V>] ? true : [undefined] extends [Yielded<V>] ? true : false;

// The keys, derived from the interface. `-?` strips optionality from the
// result and not from the subject, so the answer is a clean union of names and
// an optional member still reads as admitting undefined.
type AdmitsAbsence<T> = { [K in keyof T]-?: Absent<T[K]> extends true ? K : never }[keyof T];

type Nothing<K extends never> = K;

type Assert<T extends true> = T;

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// The instrument, proved before it is trusted: every way a member has of
// admitting nothing, and one member of each kind that does not. A derivation
// that had stopped naming anything would pass every check below in silence,
// which is the whole failure this replaces.
interface EveryWayOfAdmittingNothing {
  total: string;
  nullable: string | null;
  undefinable: string | undefined;
  optional?: string;
  yields(): string | null;
  does(): void;
  hands(): () => string;
}

export type TheDerivationNamesEveryWay = Assert<Exactly<AdmitsAbsence<EveryWayOfAdmittingNothing>, 'nullable' | 'undefinable' | 'optional' | 'yields'>>;

// The members that may honestly hold nothing, each because the thing it reads
// can genuinely have nothing to say: no run is under way, no modal is being
// asked, the store cannot answer. Naming one is a decision and is meant to
// cost a reader a moment; what it cannot do is go stale, because the pair of
// checks below fails on a name that stops admitting absence as loudly as on a
// field that starts.
type HonestlyAbsentOnASnapshot = 'live';

type HonestlyAbsentOnTheDriver = 'localChanges';

type HonestlyAbsentOnTheHarness = 'live' | 'modal';

export type NothingElseOnASnapshotMayBeAbsent = Nothing<Exclude<AdmitsAbsence<DriverSnapshot>, HonestlyAbsentOnASnapshot>>;

export type NoStaleExemptionOnASnapshot = Nothing<Exclude<HonestlyAbsentOnASnapshot, AdmitsAbsence<DriverSnapshot>>>;

export type NothingElseOnTheDriverMayBeAbsent = Nothing<Exclude<AdmitsAbsence<Driver>, HonestlyAbsentOnTheDriver>>;

export type NoStaleExemptionOnTheDriver = Nothing<Exclude<HonestlyAbsentOnTheDriver, AdmitsAbsence<Driver>>>;

export type NothingElseOnTheHarnessMayBeAbsent = Nothing<Exclude<AdmitsAbsence<TestState>, HonestlyAbsentOnTheHarness>>;

export type NoStaleExemptionOnTheHarness = Nothing<Exclude<HonestlyAbsentOnTheHarness, AdmitsAbsence<TestState>>>;

// The other half, which no type can state about itself: that nowhere the
// driver is driven from asks whether the view it was handed is there. A
// non-null assertion satisfies the compiler and leaves the reader exactly the
// question the type removed, so the compiler is asked the question instead of
// being taken as the answer.

// This half is a named grammar and not a closed set, and this is the one place
// its edge is written down. What it reaches is the forms in which the language
// itself marks a value's presence as the thing being decided, over the
// top-level union members of what a declaration says it holds. Three shapes
// are outside it. A position where presence decides something that the grammar
// does not name — `switch`/`case`, `??=`, a destructuring default, a default
// parameter, `Object.is`. The nothing put back where the walk does not
// descend — inside a type argument, a type-parameter constraint or a cast. And
// a runtime assertion, `expect(<it>).not.toBeNull()`, whose subject is an
// argument to a library call and is marked as questioned by nothing in the
// syntax. The first shape closes by asking the checker whether a condition's
// type leaves it always true rather than by listing node kinds, which is a new
// dependency and a new gate and so is a spec of its own; the third is outside
// that answer too, because an argument is not a condition position.
// What makes this a boundary and not a hole is the half above: a nullable
// cannot be published at all, so a spelling that escapes here is a reader
// writing a check that cannot be false, never a type that lies.

const here = fileURLToPath(new URL('.', import.meta.url));

const root = resolve(here, '..', '..');

const slashed = (path: string): string => path.replace(/\\/g, '/');

// The two directories a driver is driven from, which is the set surface.test.ts
// already holds the door to. Tests are in it because the question reads the
// same wherever it is asked: a fixture that unwraps what it was handed leaves
// the next reader the same doubt a component would.
const DRIVEN_FROM = [`${slashed(root)}/src/ui/`, `${slashed(root)}/scripts/`];

// One entry for each form the grammar names, written as the source a reader
// would write. They are compiled by the same program that reads the tree and
// are read by the same walk, so what holds the tree is what these prove —
// rather than a second list of patterns checked against the first. This is a
// regression fixture for the forms below and never the definition of asking;
// what the grammar does not reach is stated with the half it belongs to.
const SPELLINGS: readonly string[] = [
  `export interface PutItBack { view?: Published }`,
  `export interface OrNull { view: Published | null }`,
  `export interface OrUndefined { view: Published | undefined }`,
  `export type Aliased = Published | null;`,
  `export function optionalParameter(view?: Published): unknown { return view; }`,
  `export function annotatedReturn(s: Snapshot): Published | null { return s.view; }`,
  `export function ifIt(s: Snapshot): number { if (s.view) return 1; return 0; }`,
  `export function negated(s: Snapshot): number { const renamed = s.view; if (!renamed) return 2; return 0; }`,
  `export function looseNull(s: Snapshot): number { const renamed = s.view; if (renamed == null) return 3; return 0; }`,
  `export function looseNotNull(s: Snapshot): number { const renamed = s.view; if (renamed != null) return 4; return 0; }`,
  `export function strictNull(s: Snapshot): number { const renamed = s.view; if (renamed === null) return 5; return 0; }`,
  `export function nothingFirst(s: Snapshot): number { const renamed = s.view; if (undefined !== renamed) return 6; return 0; }`,
  `export function typeofIt(s: Snapshot): number { const renamed = s.view; if (typeof renamed === 'undefined') return 7; return 0; }`,
  `export function booleanOf(s: Snapshot): number { const renamed = s.view; if (Boolean(renamed)) return 8; return 0; }`,
  `export function whileIt(s: Snapshot): number { const renamed = s.view; while (renamed) return 9; return 0; }`,
  `export function wrappedTernary(s: Snapshot): number {\n  const renamed = s.view;\n  return renamed\n    ? 10\n    : 11;\n}`,
  `export function chained(s: Snapshot): unknown { const renamed = s.view; return renamed?.said; }`,
  `export function defaulted(s: Snapshot): unknown { const renamed = s.view; return renamed ?? null; }`,
  `export function asserted(s: Snapshot): unknown { const renamed = s.view; return renamed!.said; }`,
  `export function guarded(s: Snapshot): unknown { const renamed = s.view; return renamed && renamed.said; }`,
];

// The other side of the same fixture: reading a field off what was published
// is not asking whether it is there, and a rule that cannot tell the two apart
// refuses every use of the thing it is protecting.
// One layer down the same type genuinely may be missing — a command result
// carries a view only where the command produced one — so a question about one
// of those is a question worth asking, and a rule that cannot tell it from a
// dead one refuses honest code.
const USES = `import type { CommandResult } from '../runtime/command';
export function reads(s: Snapshot): unknown {
  const renamed = s.view;
  return [renamed.said, renamed.choices[0], renamed.modals.length > 0 ? 1 : 0, renamed.location.title, s.live?.label];
}
export function readsOneThatMayBeMissing(result: CommandResult): unknown {
  return result.view === undefined ? null : [result.view.said, result.view!.time];
}`;

const PREAMBLE = `import type { DriverSnapshot } from './driver';\ntype Snapshot = DriverSnapshot;\ntype Published = DriverSnapshot['view'];\n`;

const FIXTURE_PATH = `${slashed(root)}/src/ui/every-spelling.fixture.ts`;

const FIXTURE_TEXT = `${PREAMBLE}${SPELLINGS.join('\n')}\n${USES}\n`;

// Where in the fixture each spelling starts, worked out while the text is
// assembled rather than counted by hand, so a spelling that takes four lines
// is still one entry, and where the uses begin.
const STARTS: number[] = [];

const USES_FROM: number = (() => {
  let line = PREAMBLE.split('\n').length;
  for (const spelling of SPELLINGS) {
    STARTS.push(line);
    line += spelling.split('\n').length;
  }
  return line;
})();

const spellingAt = (line: number): number => STARTS.reduce((found, start, at) => (start <= line ? at : found), -1);

function programOver(fixture: string): ts.Program {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')!;
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(String(diagnostic.messageText));
    },
  } as ts.ParseConfigFileHost)!;

  const host = ts.createCompilerHost(parsed.options, true);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  const isFixture = (name: string): boolean => slashed(name) === FIXTURE_PATH;

  host.readFile = (name) => (isFixture(name) ? fixture : readFile(name));
  host.fileExists = (name) => isFixture(name) || fileExists(name);
  host.getSourceFile = (name, language, onError, shouldCreate) =>
    isFixture(name) ? ts.createSourceFile(name, fixture, language, true) : getSourceFile(name, language, onError, shouldCreate);

  return ts.createProgram({ rootNames: [...parsed.fileNames, FIXTURE_PATH], options: parsed.options, host });
}

const program = programOver(FIXTURE_TEXT);

const checker = program.getTypeChecker();

// The type in question, read off the interface that publishes it. Nothing here
// names it: a rename carries the rule with it, and what the rule is about is
// whatever the driver hands the shell.
const published = (() => {
  const file = program.getSourceFiles().find((each) => slashed(each.fileName) === slashed(resolve(here, 'driver.ts')))!;
  const module = checker.getSymbolAtLocation(file)!;
  const snapshot = checker.getExportsOfModule(module).find((each) => each.name === 'DriverSnapshot')!;
  const property = checker.getPropertyOfType(checker.getDeclaredTypeOfSymbol(snapshot), 'view')!;
  return checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration!);
})();

const NOTHING = ts.TypeFlags.Null | ts.TypeFlags.Undefined;

const members = (type: ts.Type): ts.Type[] => (type.isUnion() ? type.types.flatMap(members) : [type]);

const isPublished = (type: ts.Type): boolean => members(type).some((member) => member === published);

const admitsNothing = (type: ts.Type): boolean => members(type).some((member) => (member.flags & NOTHING) !== 0);

interface Asked {
  file: string;
  line: number;
  asked: string;
  written: string;
}

// What the binding was declared to hold, never what the flow says it holds at
// this point: a question asked earlier narrows its own subject away, and the
// second question — the dead one — is what is being looked for.
function held(subject: ts.Expression): ts.Type {
  const symbol = checker.getSymbolAtLocation(subject);
  return symbol === undefined ? checker.getTypeAtLocation(subject) : checker.getTypeOfSymbol(symbol);
}

const isNothingLiteral = (node: ts.Expression): boolean => node.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(node) && node.text === 'undefined');

// The forms in which the language marks a value's presence as the thing being
// decided. Reading the grammar rather than the text is what survives a rename
// or a line break; what it is not is every position where presence decides
// something, which is the edge stated where this half is introduced.
function questions(node: ts.Node): Array<{ asked: string; subject: ts.Expression }> {
  if (ts.isNonNullExpression(node)) return [{ asked: 'asserts it away', subject: node.expression }];
  if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node)) && node.questionDotToken !== undefined) {
    return [{ asked: 'chains off it optionally', subject: node.expression }];
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.QuestionQuestionToken) return [{ asked: 'defaults it away', subject: node.left }];
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken || operator === ts.SyntaxKind.BarBarToken) return [{ asked: 'guards on its truth', subject: node.left }];
    const compares = operator === ts.SyntaxKind.EqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken || operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsEqualsToken;
    if (!compares) return [];
    if (isNothingLiteral(node.right)) return [{ asked: 'compares it with nothing', subject: node.left }];
    if (isNothingLiteral(node.left)) return [{ asked: 'compares nothing with it', subject: node.right }];
    if (ts.isTypeOfExpression(node.left)) return [{ asked: 'asks what type it is', subject: node.left.expression }];
    if (ts.isTypeOfExpression(node.right)) return [{ asked: 'asks what type it is', subject: node.right.expression }];
    return [];
  }
  if (ts.isConditionalExpression(node)) return [{ asked: 'branches on its truth', subject: node.condition }];
  if (ts.isIfStatement(node)) return [{ asked: 'branches on its truth', subject: node.expression }];
  if (ts.isWhileStatement(node) || ts.isDoStatement(node)) return [{ asked: 'loops on its truth', subject: node.expression }];
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) return [{ asked: 'negates it', subject: node.operand }];
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Boolean' && node.arguments.length === 1) {
    return [{ asked: 'asks whether it is there at all', subject: node.arguments[0] }];
  }
  return [];
}

// What a declaration says it holds, which is the half the questions above
// cannot reach: putting the nothing back is not asking a question, it is
// making one askable.
function declared(node: ts.Node): ts.Type | null {
  if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node) || ts.isParameter(node)) return checker.getTypeAtLocation(node);
  if (ts.isTypeAliasDeclaration(node)) return checker.getTypeAtLocation(node.type);
  if (ts.isFunctionLike(node)) {
    const signature = checker.getSignatureFromDeclaration(node);
    return signature === undefined ? null : checker.getReturnTypeOfSignature(signature);
  }
  return null;
}

function askedIn(file: ts.SourceFile): Asked[] {
  const found: Asked[] = [];
  const at = (node: ts.Node, asked: string): void => {
    found.push({
      file: slashed(file.fileName).slice(slashed(root).length + 1),
      line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      asked,
      written: node.getText().slice(0, 80).replace(/\s+/g, ' '),
    });
  };
  const walk = (node: ts.Node): void => {
    const holds = declared(node);
    if (holds !== null && isPublished(holds) && admitsNothing(holds)) at(node, 'declares it in a union with nothing');
    for (const { asked, subject } of questions(node)) {
      const type = held(subject);
      if (isPublished(type) && !admitsNothing(type)) at(node, asked);
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  return found;
}

const SCANNED = program.getSourceFiles().filter((file) => DRIVEN_FROM.some((directory) => slashed(file.fileName).startsWith(directory)) && slashed(file.fileName) !== FIXTURE_PATH);

const IN_THE_FIXTURE = askedIn(program.getSourceFiles().find((each) => slashed(each.fileName) === FIXTURE_PATH)!);

// Walked once, where the tree is read rather than inside a case: the program
// and the walk are what this file costs, and paying it per assertion is what
// puts a derived rule up against a runner's clock.
const IN_THE_TREE = SCANNED.flatMap(askedIn);

describe('the shell is never handed a missing one (c2)', () => {
  it('reads the tree it is a rule about, off the program rather than off a list of names', () => {
    const files = SCANNED.map((file) => slashed(file.fileName).slice(slashed(root).length + 1));

    expect(checker.typeToString(published)).toBe('PlayView');
    expect(files).toContain('src/ui/App.tsx');
    expect(files).toContain('src/ui/published.test.ts');
    expect(files).toContain('scripts/drift.test.ts');
    expect(files.length).toBeGreaterThan(20);
  });

  it('catches every form its grammar names, including the ones no text rule reaches', () => {
    const caught = new Set(IN_THE_FIXTURE.filter((one) => one.line < USES_FROM).map((one) => spellingAt(one.line)));

    expect(SPELLINGS.filter((_, at) => !caught.has(at))).toEqual([]);
  });

  it('takes a use for a use, so the rule is about asking rather than about the word', () => {
    expect(IN_THE_FIXTURE.filter((one) => one.line >= USES_FROM)).toEqual([]);
  });

  it('finds no such question anywhere the driver is driven from', () => {
    expect(IN_THE_TREE).toEqual([]);
  });
});
