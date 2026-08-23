import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { TestState } from './agent/testHarness';
import type { Driver, DriverSnapshot } from './driver';

type Yielded<V> = [V] extends [(...args: never[]) => infer R] ? R : V;

type Absent<V> = [Yielded<V>] extends [void] ? false : [null] extends [Yielded<V>] ? true : [undefined] extends [Yielded<V>] ? true : false;

type AdmitsAbsence<T> = { [K in keyof T]-?: Absent<T[K]> extends true ? K : never }[keyof T];

type Nothing<K extends never> = K;

type Assert<T extends true> = T;

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

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

// `live` is nothing under way; `playtest` is no run being recorded, which is what not being in
// playtest mode *is* — a second flag beside it would be the thing that could disagree with it.
type HonestlyAbsentOnASnapshot = 'live' | 'playtest';

type HonestlyAbsentOnTheDriver = 'localChanges';

type HonestlyAbsentOnTheHarness = 'live' | 'modal';

export type NothingElseOnASnapshotMayBeAbsent = Nothing<Exclude<AdmitsAbsence<DriverSnapshot>, HonestlyAbsentOnASnapshot>>;

export type NoStaleExemptionOnASnapshot = Nothing<Exclude<HonestlyAbsentOnASnapshot, AdmitsAbsence<DriverSnapshot>>>;

export type NothingElseOnTheDriverMayBeAbsent = Nothing<Exclude<AdmitsAbsence<Driver>, HonestlyAbsentOnTheDriver>>;

export type NoStaleExemptionOnTheDriver = Nothing<Exclude<HonestlyAbsentOnTheDriver, AdmitsAbsence<Driver>>>;

export type NothingElseOnTheHarnessMayBeAbsent = Nothing<Exclude<AdmitsAbsence<TestState>, HonestlyAbsentOnTheHarness>>;

export type NoStaleExemptionOnTheHarness = Nothing<Exclude<HonestlyAbsentOnTheHarness, AdmitsAbsence<TestState>>>;

const here = fileURLToPath(new URL('.', import.meta.url));

const root = resolve(here, '..', '..');

const slashed = (path: string): string => path.replace(/\\/g, '/');

const DRIVEN_FROM = [`${slashed(root)}/src/ui/`, `${slashed(root)}/scripts/`];

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

function held(subject: ts.Expression): ts.Type {
  const symbol = checker.getSymbolAtLocation(subject);
  return symbol === undefined ? checker.getTypeAtLocation(subject) : checker.getTypeOfSymbol(symbol);
}

const isNothingLiteral = (node: ts.Expression): boolean => node.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(node) && node.text === 'undefined');

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
