import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { shippedModules } from './lib/layers';

// The subject set is the same enumeration the layer rule sweeps, tests taken
// out. A rule about the code this repository ships that walks a tree of its
// own reaches whichever driver that tree happens to hold and no other.
const root = process.cwd().replace(/\\/g, '/');

function programOverShippedModules(): ts.Program {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (configPath === undefined) throw new Error('no tsconfig.json at the repository root');
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, root);
  return ts.createProgram(shippedModules().map((file) => path.resolve(root, file)), { ...parsed.options, noEmit: true });
}

// A union is discriminated when one property is a distinct string literal on
// every constituent. Asking the checker rather than reading the source is what
// makes a union declared next month a subject of this rule without an edit.
function discriminantOf(checker: ts.TypeChecker, type: ts.Type): string | null {
  if (!type.isUnion() || type.types.length < 2) return null;
  for (const name of checker.getPropertiesOfType(type.types[0]).map((property) => property.name)) {
    const spellings = literalsOf(checker, type, name);
    if (spellings !== null && new Set(spellings).size === type.types.length) return name;
  }
  return null;
}

function literalsOf(checker: ts.TypeChecker, type: ts.Type, name: string): string[] | null {
  if (!type.isUnion()) return null;
  const spellings: string[] = [];
  for (const member of type.types) {
    const property = checker.getPropertyOfType(member, name);
    const declaration = member.symbol?.declarations?.[0] ?? property?.valueDeclaration;
    if (property === undefined || declaration === undefined) return null;
    const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
    if (!propertyType.isStringLiteral()) return null;
    spellings.push(propertyType.value);
  }
  return spellings;
}

interface Consumer {
  where: string;
  union: string;
  discriminant: string;
  handled: number;
  members: number;
  missing: string[];
  guarded: boolean;
  delegating: boolean;
}

// `default:` that assigns the scrutinee to `never`. The assignment is the
// whole mechanism: it is the one form that cannot be written so as to pass
// while being false, which a hand-written assertion can.
const NEVER_GUARD = /:\s*never\b|<\s*never\s*>|satisfies\s+never/;

// A default that hands the scrutinee to another consumer of the same union is
// not absorbing it — it is dispatching, and the consumer it dispatches to is
// held to this same rule, so the chain terminates at a guard. `resultLines`
// prints five wrappers and hands every leaf to `result`, which is total; a
// twenty-first member reaches `result` and fails to compile there. Requiring a
// guard here as well would ask an author to name every leaf in a function
// about wrappers, which is the enumeration this rule exists to remove.
function delegates(checker: ts.TypeChecker, clause: ts.DefaultClause, subject: ts.Expression, union: ts.Type): boolean {
  let found = false;
  const scrutinee = ts.isIdentifier(subject) ? checker.getSymbolAtLocation(subject) : undefined;
  const visit = (node: ts.Node): void => {
    if (!found && ts.isCallExpression(node)) {
      const signature = checker.getResolvedSignature(node);
      node.arguments.forEach((argument, at) => {
        // The scrutinee is narrowed to the unhandled members by the time it
        // reaches the default, so the union is read off the callee's parameter
        // rather than off the argument: what matters is that the thing being
        // handed the value declares it can answer for the whole union.
        const parameter = signature?.parameters[at];
        const declared = parameter?.valueDeclaration === undefined ? undefined : checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration);
        const passed = ts.isIdentifier(argument) ? checker.getSymbolAtLocation(argument) : undefined;
        if (scrutinee !== undefined && passed === scrutinee && declared === union) found = true;
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(clause);
  return found;
}

function consumersIn(program: ts.Program): Consumer[] {
  const checker = program.getTypeChecker();
  const found: Consumer[] = [];
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile) continue;
    const relative = file.fileName.replace(`${root}/`, '');
    if (!/^(src|scripts)\//.test(relative)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isSwitchStatement(node)) {
        const consumer = consumerAt(checker, file, node, relative);
        if (consumer !== null) found.push(consumer);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return found;
}

function consumerAt(checker: ts.TypeChecker, file: ts.SourceFile, node: ts.SwitchStatement, relative: string): Consumer | null {
  const access = ts.isPropertyAccessExpression(node.expression) ? node.expression : null;
  const subject = access === null ? node.expression : access.expression;
  const type = checker.getTypeAtLocation(subject);
  const discriminant = discriminantOf(checker, type);
  if (discriminant === null) return null;
  if (access !== null && access.name.text !== discriminant) return null;
  const members = literalsOf(checker, type, discriminant) ?? [];
  const handled: string[] = [];
  let guarded = false;
  let delegating = false;
  for (const clause of node.caseBlock.clauses) {
    if (ts.isDefaultClause(clause)) {
      delegating = delegates(checker, clause, subject, type);
      guarded = NEVER_GUARD.test(clause.getText(file)) || delegating;
    }
    else if (ts.isStringLiteral(clause.expression)) handled.push(clause.expression.text);
  }
  return {
    where: `${relative}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`,
    union: checker.typeToString(type),
    discriminant,
    handled: handled.length,
    members: members.length,
    missing: members.filter((member) => !handled.includes(member)),
    guarded,
    delegating,
  };
}

const program = programOverShippedModules();
const consumers = consumersIn(program);

describe('every consumer of a discriminated union is total', () => {
  // A derived proof that stops naming anything otherwise passes in silence.
  it('the walk had subjects', () => {
    expect(consumers.length).toBeGreaterThan(10);
  });

  it('no switch leaves a member of its union unhandled', () => {
    const short = consumers.filter((consumer) => consumer.missing.length > 0 && !consumer.delegating);
    expect(short.map((consumer) => `${consumer.where} ${consumer.union} misses ${consumer.missing.join(', ')}`)).toEqual([]);
  });

  // Requiring the guard on every consumer rather than only on the ones a
  // return type does not already protect is the difference between one rule
  // and two: a function whose return type stops admitting `undefined` next
  // month would otherwise move a switch between the two without anyone
  // reading the switch. `applyOne` was the case that made this the rule —
  // nineteen arms, no default, complete only for as long as nobody adds a
  // twenty-first member.
  it('every switch carries a default that assigns its scrutinee to never', () => {
    const unguarded = consumers.filter((consumer) => !consumer.guarded);
    expect(unguarded.map((consumer) => `${consumer.where} ${consumer.union} has no never assignment in its default`)).toEqual([]);
  });
});

describe('the guard bites', () => {
  // c1 says the shape is in place. This says the shape fails when it should,
  // which is the difference between a proof that is red-green and one that is
  // only green: the mechanism is asked to reject a case it must reject.
  const fixture = (handled: readonly string[]): string =>
    [
      `type Member = { kind: 'a'; a: number } | { kind: 'b'; b: number } | { kind: 'c'; c: number };`,
      `export function read(value: Member): number {`,
      `  switch (value.kind) {`,
      ...handled.map((kind) => `    case '${kind}': return value.${kind};`),
      `    default: { const never: never = value; return never; }`,
      `  }`,
      `}`,
    ].join('\n');

  function errorsIn(source: string): string[] {
    const name = `${root}/exhaustive-fixture.ts`;
    const host = ts.createCompilerHost({ strict: true });
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
      fileName === name ? ts.createSourceFile(fileName, source, languageVersion, true) : original(fileName, languageVersion, onError, shouldCreate);
    host.fileExists = (fileName) => fileName === name || ts.sys.fileExists(fileName);
    host.readFile = (fileName) => (fileName === name ? source : ts.sys.readFile(fileName));
    const built = ts.createProgram([name], { strict: true, noEmit: true, skipLibCheck: true }, host);
    return built
      .getSemanticDiagnostics(built.getSourceFile(name))
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
  }

  it('accepts a switch that handles every member', () => {
    expect(errorsIn(fixture(['a', 'b', 'c']))).toEqual([]);
  });

  it('refuses a switch that handles all but one', () => {
    const errors = errorsIn(fixture(['a', 'b']));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toContain('never');
  });
});
