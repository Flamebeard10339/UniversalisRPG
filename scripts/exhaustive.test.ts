import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { programOverShippedModules, programOverSource, relativeTo, repoRoot } from './lib/shippedProgram';

const root = repoRoot;

// A union is discriminated at a property when every constituent declares a
// string literal there. That is the checker's own test for narrowing a switch,
// and it is deliberately weaker than requiring the literals to differ:
// `CommandOutput` spells `kind: 'message'` twice, TypeScript narrows it anyway,
// and a rule that asked for distinctness reported clean over both switches on
// it. Asking the checker rather than reading the source is what makes a union
// declared next month a subject of this rule without an edit.
//
// `named` is the property the switch actually reads, when it reads one. The
// checker narrows on the property switched, so that is the property to ask
// about; searching for some other one can only find a discriminant nobody
// dispatched on.
function discriminantOf(checker: ts.TypeChecker, type: ts.Type, named: string | null): string | null {
  if (!type.isUnion() || type.types.length < 2) return null;
  const candidates = named === null ? checker.getPropertiesOfType(type.types[0]).map((property) => property.name) : [named];
  for (const name of candidates) if (literalsOf(checker, type, name) !== null) return name;
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

function consumersIn(program: ts.Program, include: (relative: string) => boolean = (relative) => /^(src|scripts)\//.test(relative)): Consumer[] {
  const checker = program.getTypeChecker();
  const found: Consumer[] = [];
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile) continue;
    const relative = relativeTo(root, file.fileName);
    if (!include(relative)) continue;
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
  const discriminant = discriminantOf(checker, type, access === null ? null : access.name.text);
  if (discriminant === null) return null;
  const members = [...new Set(literalsOf(checker, type, discriminant) ?? [])];
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

// One source, compiled alone, analysed by the same walk the tree gets. Every
// red-green case below is a fixture where the right answer is known, which is
// the only way a rule about what the checker sees can be watched failing.
function consumersInFixture(name: string, source: string): Consumer[] {
  const relative = relativeTo(root, name);
  return consumersIn(programOverSource(name, source), (each) => each === relative);
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
    const built = programOverSource(name, source);
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

describe('the delegation exemption discriminates', () => {
  // The exemption is the one place this rule can be made vacuous: every switch
  // in the tree now carries a default, so an exemption that fired on all of
  // them would pass c1 while proving nothing. Mutation found exactly that —
  // forcing `delegates` to return true survived the whole suite — so the
  // exemption is held to the same red-green standard as the guard itself,
  // against a fixture where the right answer is known both ways.
  const FIXTURE = [
    `type M = { kind: 'a'; a: number } | { kind: 'b'; b: number } | { kind: 'c'; c: number };`,
    `function total(value: M): number {`,
    `  switch (value.kind) {`,
    `    case 'a': return value.a;`,
    `    case 'b': return value.b;`,
    `    case 'c': return value.c;`,
    `    default: { const unreached: never = value; return unreached; }`,
    `  }`,
    `}`,
    `export function dispatching(value: M): number {`,
    `  switch (value.kind) {`,
    `    case 'a': return value.a;`,
    `    default: return total(value);`,
    `  }`,
    `}`,
    `export function absorbing(value: M): number {`,
    `  switch (value.kind) {`,
    `    case 'a': return value.a;`,
    `    default: return 0;`,
    `  }`,
    `}`,
  ].join('\n');

  const analysed = (): Consumer[] => consumersInFixture(`${root}/delegation-fixture.ts`, FIXTURE);

  // In source order: the total consumer, the one that dispatches to it, the
  // one that answers for itself.
  it('finds all three switches the fixture declares', () => {
    expect(analysed().map((consumer) => consumer.handled)).toEqual([3, 1, 1]);
  });

  it('reads a default that hands the scrutinee on as dispatching', () => {
    const [, dispatching] = analysed();
    expect(dispatching.delegating).toBe(true);
    expect(dispatching.guarded).toBe(true);
  });

  it('reads a default that answers for itself as absorbing', () => {
    const [, , absorbing] = analysed();
    expect(absorbing.delegating).toBe(false);
    expect(absorbing.guarded).toBe(false);
  });
});

describe('the subject set is what the checker narrows', () => {
  // A union that spells one literal twice at its discriminant is a union
  // TypeScript narrows, so it is a union this rule has to ask about.
  // `CommandOutput` is the measured case: `PlayerMessage` and `ToolMessage`
  // both declare `kind: 'message'`, and for as long as the rule asked for
  // distinct literals it reported clean over two unguarded switches on it.
  const REPEATED = [
    `type M = { kind: 'a'; words: 'said'; a: number } | { kind: 'a'; words: 'noted'; b: number } | { kind: 'b'; c: number };`,
    `export function read(value: M): number {`,
    `  switch (value.kind) {`,
    `    case 'a': return 1;`,
    `    case 'b': return value.c;`,
    `    default: { const unreached: never = value; return unreached; }`,
    `  }`,
    `}`,
  ].join('\n');

  it('reads a union that spells one literal twice as discriminated on it', () => {
    const [consumer] = consumersInFixture(`${root}/repeated-fixture.ts`, REPEATED);
    expect(consumer.discriminant).toBe('kind');
    expect(consumer.members).toBe(2);
    expect(consumer.missing).toEqual([]);
    expect(consumer.guarded).toBe(true);
  });

  // The other side of the same question. A property the checker cannot narrow
  // on is not a discriminant, and a rule looser than the checker would demand
  // totality over a set no switch can exhaust.
  const OPEN = [
    `type N = { kind: 'a'; label: string } | { kind: 'b'; label: 'fixed' };`,
    `export function read(value: N): number {`,
    `  switch (value.label) {`,
    `    case 'fixed': return 1;`,
    `    default: return 0;`,
    `  }`,
    `}`,
  ].join('\n');

  it('reads a property that is not a literal on every constituent as no discriminant', () => {
    expect(consumersInFixture(`${root}/open-fixture.ts`, OPEN)).toEqual([]);
  });
});
