import { RuntimeError } from './error';
import { describe, expect, it } from 'vitest';
import { advanceTime, createGameState, evaluateCondition, renderSegments, useAction } from './runtime';
import { loadModule } from '../content/load';
import { runTest, sessionStatus, startSession, view, wait } from './session';
import { secondsToMs } from './units';

describe('advanceTime', () => {
  it('accrues integer milliseconds onto state.time', () => {
    const state = createGameState();
    expect(state.time).toBe(0);
    advanceTime(state, 10_000);
    expect(state.time).toBe(10_000);
    advanceTime(state, 2500);
    expect(state.time).toBe(12_500);
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
    advanceTime(state, secondsToMs(100));
    expect(evaluateCondition({ kind: 'comparison', left: { path: ['time'] }, operator: '>=', right: 100 }, state)).toBe(true);
    expect(evaluateCondition({ kind: 'comparison', left: { path: ['time'] }, operator: '>', right: 100 }, state)).toBe(false);
  });

  it('interpolates into rendered text', () => {
    const state = createGameState();
    advanceTime(state, secondsToMs(42));
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

# entity mirror
glance:
  instant
  say: You glance at yourself.
`;

  it('advances state.time by the action\'s time: on success', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    state.inventory['cooked-shrimp'] = 1;
    useAction('entity', 'campfire', 'cook', registry, state);
    expect(state.time).toBe(secondsToMs(30));
  });

  it('does not advance time when the action is unaffordable (shortfall branch)', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    useAction('entity', 'campfire', 'cook', registry, state);
    expect(state.time).toBe(0);
    expect(state.inventory['cooked-shrimp'] ?? 0).toBe(0);
  });

  it('gives an action that names no cadence the default-action-duration, which ships at 0', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    useAction('entity', 'well', 'draw', registry, state);
    expect(state.time).toBe(0);
  });

  it('spans an untagged action by a raised default-action-duration and leaves an instant one at 0', () => {
    const registry = loadModule(`# variable default-action-duration\nvalue: 7\n${MODULE}`);

    const drawing = createGameState();
    useAction('entity', 'well', 'draw', registry, drawing);
    expect(drawing.time).toBe(secondsToMs(7));

    const glancing = createGameState();
    useAction('entity', 'mirror', 'glance', registry, glancing);
    expect(glancing.time).toBe(0);
  });

  it('refuses a negative default-action-duration instead of quietly reading it as 0', () => {
    expect(() => loadModule('# variable default-action-duration\nvalue: -5\n')).toThrow(/# variable default-action-duration must be at least 0, got -5/);
  });

  it('refuses time: 0 and names the tag that means it', () => {
    expect(() => loadModule('# entity clock\ntick:\n  time: 0\n  say: Tick.\n')).toThrow(/action "tick": time: must be positive.*carries no cadence/);
  });
});

describe('session wait()', () => {
  const MODULE = `
# location camp
x: 0, y: 0
starting
`;

  it('advances the session’s simulated time and reflects it in the returned PlayView', () => {
    const registry = loadModule(MODULE);
    const session = startSession(registry);
    expect(view(session).time).toBe(0);

    const v = wait(session, 15);
    expect(v.time).toBe(15);
    expect(sessionStatus(session).time).toBe(15);
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
    expect(state.time).toBe(secondsToMs(61));
  });

  it('fails and reports the unmet condition when the wait is too short', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    const result = runTest('wait-not-enough', registry, state);
    expect(result.passed).toBe(false);
    expect(result.failure).toBe('time > 60');
  });
});

describe('wait: done stands until what is under way has finished', () => {
  const MODULE = `
# location camp
x: 0, y: 0
starting
entities: kiln

# item brick

# entity kiln
fire:
  time: 45
  on success:
    give: 1 brick
bake forever:
  continuous
  rate: 60
  on success:
    give: 1 brick

# test one-firing
goto: camp
begin: use entity.kiln.fire
wait: done
assert: time = 45
assert: inventory.brick = 1

# test nothing-under-way
wait: done
assert: time = 0

# test a-kiln-that-never-stops
goto: camp
begin: use entity.kiln.bake-forever
wait: done
`;

  const registry = () => loadModule(MODULE);

  it('runs an armed action out to its end without being told how long that is', () => {
    expect(runTest('one-firing', registry(), createGameState())).toEqual({ passed: true });
  });

  it('is a no-op when nothing is under way', () => {
    expect(runTest('nothing-under-way', registry(), createGameState())).toEqual({ passed: true });
  });

  it('refuses, rather than running forever, when what is under way has no end the engine can name', () => {
    const result = runTest('a-kiln-that-never-stops', registry(), createGameState());
    expect(result.passed).toBe(false);
    expect(result.failure).toMatch(/wait: done — .*no end the engine can name/);
  });
});
