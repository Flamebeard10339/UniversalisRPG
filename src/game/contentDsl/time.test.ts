import { describe, expect, it } from 'vitest';
import { advanceTime, createGameState, evaluateCondition, renderSegments, RuntimeError, useAction } from './runtime';
import { loadModule } from './registry';
import { runTest, startSession, view, wait } from './session';

describe('advanceTime', () => {
  it('accrues seconds onto state.time', () => {
    const state = createGameState();
    expect(state.time).toBe(0);
    advanceTime(state, 10);
    expect(state.time).toBe(10);
    advanceTime(state, 2.5);
    expect(state.time).toBe(12.5);
  });

  it('throws a RuntimeError on a negative delta', () => {
    const state = createGameState();
    expect(() => advanceTime(state, -1)).toThrow(RuntimeError);
    expect(state.time).toBe(0);
  });
});

describe('time reference', () => {
  it('is readable via an ordinary comparison condition', () => {
    const state = createGameState();
    advanceTime(state, 100);
    expect(evaluateCondition({ kind: 'comparison', left: { path: ['time'] }, operator: '>=', right: 100 }, state)).toBe(true);
    expect(evaluateCondition({ kind: 'comparison', left: { path: ['time'] }, operator: '>', right: 100 }, state)).toBe(false);
  });

  it('interpolates into rendered text', () => {
    const state = createGameState();
    advanceTime(state, 42);
    const rendered = renderSegments([{ kind: 'interpolate', reference: { path: ['time'] } }], state);
    expect(rendered).toBe('42');
  });
});

describe('action time cost', () => {
  const MODULE = `
# item cooked-shrimp
title: Cooked Shrimp

# entity campfire
cook:
  take: 1 cooked-shrimp
  time: 30
  on success:
    say: You cook by the fire.

# entity well
draw:
  say: You draw water.

# entity clock
tick:
  time: 0
  say: Tick.
`;

  it('advances state.time by the action\'s time: on success', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    state.inventory['cooked-shrimp'] = 1;
    useAction('entity', 'campfire', 'cook', registry, state);
    expect(state.time).toBe(30);
  });

  it('does not advance time when the action is unaffordable (shortfall branch)', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    useAction('entity', 'campfire', 'cook', registry, state);
    expect(state.time).toBe(0);
    expect(state.inventory['cooked-shrimp'] ?? 0).toBe(0);
  });

  it('defaults an action with no time: to a zero-cost, time-neutral action', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    useAction('entity', 'well', 'draw', registry, state);
    expect(state.time).toBe(0);
  });

  it('accepts an explicit time: 0', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    useAction('entity', 'clock', 'tick', registry, state);
    expect(state.time).toBe(0);
  });
});

describe('session wait()', () => {
  const MODULE = `
# location camp
x: 0, y: 0
starting
`;

  it('advances session.state.time and reflects it in the returned PlayView', () => {
    const registry = loadModule(MODULE);
    const session = startSession(registry);
    expect(view(session).time).toBe(0);

    const v = wait(session, 15);
    expect(session.state.time).toBe(15);
    expect(v.time).toBe(15);
  });
});

describe('wait: test directive', () => {
  const MODULE = `
# location camp
x: 0, y: 0
starting

# test wait-enough
wait: 61
assert: time > 60

# test wait-not-enough
wait: 30
assert: time > 60
`;

  it('passes when the waited duration satisfies the expectation', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    const result = runTest('wait-enough', registry, state);
    expect(result).toEqual({ passed: true });
    expect(state.time).toBe(61);
  });

  it('fails and reports the unmet condition when the wait is too short', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    const result = runTest('wait-not-enough', registry, state);
    expect(result.passed).toBe(false);
    expect(result.failure).toBe('time > 60');
  });
});
