import { describe, expect, it } from 'vitest';
import { Condition } from './condition';
import { applyResult, createGameState, evaluateCondition, loadModule, renderSegments, runTest } from './runtime';

const MODULE = `
# location guide-house
x: 0, y: 0
starting

# entity front-door
open: relocate: guide-house, say: The door swings open.

# dialogue miki
owner = miki

node greeting:
  when: not quest-given
  Greetings, adventurer!
  set: quest-given
  -> Sounds good.
    goto accepted
  -> I would rather not.
    goto snub

node accepted:
  Great, let us go!

node snub:
  Suit yourself.

# test enter
travel: guide-house

# test main
run: enter
talk: miki
choose: Sounds good.
use: entity.front-door.open
expect: quest-given

# test failing
talk: miki
choose: I would rather not.
expect: unlocked
`;

describe('runTest', () => {
  it('passes a script that talks, chooses, uses an action, and composes another test via run:', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    const result = runTest('main', registry, state);
    expect(result).toEqual({ passed: true });
    expect(state.location).toBe('guide-house');
    expect(state.flags['quest-given']).toBe(true);
  });

  it('fails and reports the unmet condition when an expect does not hold', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    const result = runTest('failing', registry, state);
    expect(result.passed).toBe(false);
    expect(result.failure).toBe('unlocked');
  });
});

describe('evaluateCondition', () => {
  const ref = (...path: string[]): Condition => ({ kind: 'reference', reference: { path } });

  it('treats a bare reference as a truthiness check', () => {
    const state = createGameState();
    expect(evaluateCondition(ref('unlocked'), state)).toBe(false);
    state.flags.unlocked = true;
    expect(evaluateCondition(ref('unlocked'), state)).toBe(true);
  });

  it('reads a node visit counter off a dotted <node-name>.visits reference', () => {
    const state = createGameState();
    state.visits.toll = 5;
    expect(evaluateCondition({ kind: 'comparison', left: { path: ['toll', 'visits'] }, operator: '>=', right: 5 }, state)).toBe(true);
    expect(evaluateCondition({ kind: 'comparison', left: { path: ['toll', 'visits'] }, operator: '>=', right: 6 }, state)).toBe(false);
  });

  it('combines with not/and/or', () => {
    const state = createGameState();
    state.flags.a = true;
    expect(evaluateCondition({ kind: 'not', condition: ref('a') }, state)).toBe(false);
    expect(evaluateCondition({ kind: 'and', conditions: [ref('a'), ref('b')] }, state)).toBe(false);
    expect(evaluateCondition({ kind: 'or', conditions: [ref('a'), ref('b')] }, state)).toBe(true);
  });

  it('checks a has condition against live inventory counts', () => {
    const state = createGameState();
    expect(evaluateCondition({ kind: 'has', item: 'lockpick', count: 1 }, state)).toBe(false);
    state.inventory.lockpick = 1;
    expect(evaluateCondition({ kind: 'has', item: 'lockpick', count: 1 }, state)).toBe(true);
    expect(evaluateCondition({ kind: 'has', item: 'cooked-shrimp', count: 5 }, state)).toBe(false);
    state.inventory['cooked-shrimp'] = 4;
    expect(evaluateCondition({ kind: 'has', item: 'cooked-shrimp', count: 5 }, state)).toBe(false);
    state.inventory['cooked-shrimp'] = 5;
    expect(evaluateCondition({ kind: 'has', item: 'cooked-shrimp', count: 5 }, state)).toBe(true);
  });
});

describe('applyResult', () => {
  it('sets and unsets flags', () => {
    const state = createGameState();
    applyResult({ kind: 'set', variable: 'unlocked' }, state);
    expect(state.flags.unlocked).toBe(true);
    applyResult({ kind: 'unset', variable: 'unlocked' }, state);
    expect(state.flags.unlocked).toBeUndefined();
  });

  it('gives and takes inventory counts', () => {
    const state = createGameState();
    applyResult({ kind: 'give', item: 'cooked-shrimp', amount: 5 }, state);
    applyResult({ kind: 'take', item: 'cooked-shrimp', amount: 2 }, state);
    expect(state.inventory['cooked-shrimp']).toBe(3);
  });

  it('accumulates xp and moves location on relocate/discover', () => {
    const state = createGameState();
    applyResult({ kind: 'xp', skill: 'thieving', amount: 4 }, state);
    applyResult({ kind: 'relocate', location: 'beach' }, state);
    applyResult({ kind: 'discover', location: 'bank' }, state);
    expect(state.xp.thieving).toBe(4);
    expect(state.location).toBe('beach');
    expect(state.flags['bank.discovered']).toBe(true);
  });
});

describe('renderSegments', () => {
  it('interpolates a reference and includes a conditional only when it holds', () => {
    const state = createGameState();
    state.flags.snubbed = true;
    const rendered = renderSegments(
      [
        { kind: 'literal', text: 'Hello ' },
        { kind: 'interpolate', reference: { path: ['unlocked'] } },
        { kind: 'conditional', condition: { kind: 'reference', reference: { path: ['snubbed'] } }, text: ' already answered' },
      ],
      state,
    );
    expect(rendered).toBe('Hello  already answered');
  });
});
