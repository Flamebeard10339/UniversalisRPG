import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { consumersIn, type Consumer } from './lib/exhaustive';
import { programOverShippedModules, programOverSource, relativeTo, repoRoot } from './lib/shippedProgram';
import { SECTION_KINDS } from '../src/content/sectionKind';

const root = repoRoot;

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

  // The rule's subjects include the passes over the section kinds, and each of
  // them is asked about every kind the spine declares. Without this the three
  // could stop being subjects — by taking a kind and a value again rather than
  // the union — and every clause above would go on passing over what was left.
  it('reaches the passes over a parsed section, and asks each about every kind', () => {
    const passes = consumers.filter((consumer) => consumer.union === 'ModuleSection');
    expect(passes.length).toBeGreaterThanOrEqual(3);
    expect(passes.filter((pass) => pass.members !== SECTION_KINDS.length).map((pass) => `${pass.where} sees ${pass.members} of ${SECTION_KINDS.length}`)).toEqual([]);
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
