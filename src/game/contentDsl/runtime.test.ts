import { describe, expect, it } from 'vitest';
import { Condition } from './condition';
import {
  actionFirstUnit,
  applyResult,
  armAction,
  armCraft,
  craft,
  craftFirstUnit,
  createGameState,
  evaluateCondition,
  loadModule,
  renderSegments,
  travelSecondsPerUnit,
  useAction,
} from './runtime';
import { runTest } from './session';

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
assert: quest-given

# test failing
talk: miki
choose: I would rather not.
assert: unlocked
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

describe('travelSecondsPerUnit', () => {
  it('reads the authored travel-seconds-per-unit variable', () => {
    const registry = loadModule('# variable travel-seconds-per-unit\nvalue: 7');
    expect(travelSecondsPerUnit(registry)).toBe(7);
  });

  it('falls back to the engine default when content omits the variable', () => {
    const registry = loadModule('# location camp\nx: 0, y: 0\nstarting');
    expect(travelSecondsPerUnit(registry)).toBe(5);
  });

  it('falls back to the default when the variable is declared with an empty value', () => {
    const registry = loadModule('# variable travel-seconds-per-unit');
    expect(travelSecondsPerUnit(registry)).toBe(5);
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
  // Only a `pool` result reads content; every other verb touches state alone,
  // so these gates run against an empty registry.
  const registry = loadModule('');

  it('sets and unsets flags', () => {
    const state = createGameState();
    applyResult({ kind: 'set', variable: 'unlocked' }, state, registry);
    expect(state.flags.unlocked).toBe(true);
    applyResult({ kind: 'unset', variable: 'unlocked' }, state, registry);
    expect(state.flags.unlocked).toBeUndefined();
  });

  it('gives and takes inventory counts', () => {
    const state = createGameState();
    applyResult({ kind: 'give', item: 'cooked-shrimp', amount: 5 }, state, registry);
    applyResult({ kind: 'take', item: 'cooked-shrimp', amount: 2 }, state, registry);
    expect(state.inventory['cooked-shrimp']).toBe(3);
  });

  it('floors take at 0, never driving inventory negative', () => {
    const state = createGameState();
    applyResult({ kind: 'give', item: 'cooked-shrimp', amount: 2 }, state, registry);
    applyResult({ kind: 'take', item: 'cooked-shrimp', amount: 5 }, state, registry);
    expect(state.inventory['cooked-shrimp']).toBe(0);
  });

  it('adds to a numeric flag, treating an absent or boolean-true base as 0', () => {
    const state = createGameState();
    applyResult({ kind: 'add', variable: 'rats-killed', amount: 1 }, state, registry);
    expect(state.flags['rats-killed']).toBe(1);
    applyResult({ kind: 'add', variable: 'rats-killed', amount: 1 }, state, registry);
    expect(state.flags['rats-killed']).toBe(2);

    state.flags.snubbed = true;
    applyResult({ kind: 'add', variable: 'snubbed', amount: 3 }, state, registry);
    expect(state.flags.snubbed).toBe(3);
  });

  it('flips a >= count condition true once enough add: increments land', () => {
    const state = createGameState();
    const condition: Condition = { kind: 'comparison', left: { path: ['rats-killed'] }, operator: '>=', right: 3 };
    expect(evaluateCondition(condition, state)).toBe(false);
    applyResult({ kind: 'add', variable: 'rats-killed', amount: 1 }, state, registry);
    applyResult({ kind: 'add', variable: 'rats-killed', amount: 1 }, state, registry);
    expect(evaluateCondition(condition, state)).toBe(false);
    applyResult({ kind: 'add', variable: 'rats-killed', amount: 1 }, state, registry);
    expect(evaluateCondition(condition, state)).toBe(true);
  });

  it('accumulates xp and moves location on relocate/discover', () => {
    const state = createGameState();
    applyResult({ kind: 'xp', skill: 'thieving', amount: 4 }, state, registry);
    applyResult({ kind: 'relocate', location: 'beach' }, state, registry);
    applyResult({ kind: 'discover', location: 'bank' }, state, registry);
    expect(state.xp.thieving).toBe(4);
    expect(state.location).toBe('beach');
    expect(state.flags['bank.discovered']).toBe(true);
  });

  it('logs and sets pendingModal on open-modal', () => {
    const state = createGameState();
    applyResult({ kind: 'open-modal', modal: 'character-creation' }, state, registry);
    expect(state.log).toContain('modal:character-creation');
    expect(state.pendingModal).toBe('character-creation');
  });
});

describe('useAction: take affordability and graceful failure', () => {
  const TAKE_MODULE = `
# item cooked-shrimp
title: Cooked Shrimp

# entity brazier
light:
  take: 2 cooked-shrimp
  set: brazier-lit
  on success:
    say: The brazier roars to life.

# entity shrine
offer:
  take: 2 cooked-shrimp
  set: shrine-offered
  on success:
    say: The shrine glows.
  on failure:
    say: The shrine rejects your empty hands.

# entity feast
prepare:
  take: 2 cooked-shrimp
  take: 2 cooked-shrimp
  on success:
    say: A feast is laid out.

# entity door
open:
  relocate: hallway
  say: The door creaks open.
  on success:
    say: You step through.
`;

  it('consumes items and fires on success when affordable', () => {
    const registry = loadModule(TAKE_MODULE);
    const state = createGameState();
    state.inventory['cooked-shrimp'] = 2;
    useAction('entity', 'brazier', 'light', registry, state);
    expect(state.inventory['cooked-shrimp']).toBe(0);
    expect(state.flags['brazier.brazier-lit']).toBe(true);
    expect(state.log).toEqual(['The brazier roars to life.']);
  });

  it('fires an authored on failure, applies nothing else, and leaves inventory untouched when unaffordable', () => {
    const registry = loadModule(TAKE_MODULE);
    const state = createGameState();
    state.inventory['cooked-shrimp'] = 1;
    useAction('entity', 'shrine', 'offer', registry, state);
    expect(state.inventory['cooked-shrimp']).toBe(1);
    expect(state.flags['shrine.shrine-offered']).toBeUndefined();
    expect(state.log).toEqual(['The shrine rejects your empty hands.']);
  });

  it('falls back to a generated message naming the item title when no on failure is authored', () => {
    const registry = loadModule(TAKE_MODULE);
    const state = createGameState();
    useAction('entity', 'brazier', 'light', registry, state);
    expect(state.inventory['cooked-shrimp'] ?? 0).toBe(0);
    expect(state.flags['brazier.brazier-lit']).toBeUndefined();
    expect(state.log).toEqual(["You don't have enough Cooked Shrimp."]);
  });

  it('fails atomically: an unaffordable action does not apply its other results', () => {
    const registry = loadModule(TAKE_MODULE);
    const state = createGameState();
    useAction('entity', 'shrine', 'offer', registry, state);
    expect(state.flags['shrine.shrine-offered']).toBeUndefined();
  });

  it('sums multiple take: results on the same item before checking affordability', () => {
    const registry = loadModule(TAKE_MODULE);

    const short = createGameState();
    short.inventory['cooked-shrimp'] = 3;
    useAction('entity', 'feast', 'prepare', registry, short);
    expect(short.inventory['cooked-shrimp']).toBe(3);
    expect(short.log).toEqual(["You don't have enough Cooked Shrimp."]);

    const enough = createGameState();
    enough.inventory['cooked-shrimp'] = 4;
    useAction('entity', 'feast', 'prepare', registry, enough);
    expect(enough.inventory['cooked-shrimp']).toBe(0);
    expect(enough.log).toEqual(['A feast is laid out.']);
  });

  it('fires on success as before for an action with no take:', () => {
    const registry = loadModule(TAKE_MODULE);
    const state = createGameState();
    useAction('entity', 'door', 'open', registry, state);
    expect(state.location).toBe('hallway');
    expect(state.log).toEqual(['The door creaks open.', 'You step through.']);
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

  it('interpolates player.name and player.race from state.player', () => {
    const state = createGameState();
    state.player = { name: 'Rowan', race: 'Elf' };
    const rendered = renderSegments(
      [
        { kind: 'literal', text: 'There you are, ' },
        { kind: 'interpolate', reference: { path: ['player', 'name'] } },
        { kind: 'literal', text: ', ' },
        { kind: 'interpolate', reference: { path: ['player', 'race'] } },
        { kind: 'literal', text: '.' },
      ],
      state,
    );
    expect(rendered).toBe('There you are, Rowan, Elf.');
  });

  it('renders an unset player.name as empty text', () => {
    const state = createGameState();
    const rendered = renderSegments([{ kind: 'interpolate', reference: { path: ['player', 'name'] } }], state);
    expect(rendered).toBe('');
  });
});

describe('armAction / actionFirstUnit: arming a spannable action without resolving it (live-mode support)', () => {
  const MODULE = `
# entity oven
roast:
  repeating
  time: 4
  give: 1 roasted-chestnut

# entity door
open:
  say: The door creaks open.
`;

  it('actionFirstUnit reports the first-unit duration for a spannable action without mutating state', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    const duration = actionFirstUnit('entity', 'oven', 'roast', registry, state);
    expect(duration).toBe(4);
    expect(state.activeAction).toBeNull();
    expect(state.time).toBe(0);
  });

  it('actionFirstUnit reports 0 for an instant action (no time:)', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    expect(actionFirstUnit('entity', 'door', 'open', registry, state)).toBe(0);
  });

  it('actionFirstUnit falls back to 0 for an unknown action or object, mutating nothing', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    expect(actionFirstUnit('entity', 'oven', 'bogus', registry, state)).toBe(0);
    expect(actionFirstUnit('entity', 'no-such-entity', 'anything', registry, state)).toBe(0);
    expect(state.activeAction).toBeNull();
  });

  it('armAction sets activeAction and reports firstUnit WITHOUT resolving any of it', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    const result = armAction('entity', 'oven', 'roast', registry, state);
    expect(result).toEqual({ armed: true, firstUnit: 4 });
    expect(state.activeAction).toEqual({ ownerRef: 'entity.oven', actionLabel: 'roast', progress: 0, repeating: true, healthRemaining: 1, attemptsMade: 0 });
    expect(state.time).toBe(0);
    expect(state.inventory['roasted-chestnut'] ?? 0).toBe(0);
  });

  it('useAction (armAction immediately followed by resolve) still completes the first unit instantly, unchanged', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    useAction('entity', 'oven', 'roast', registry, state);
    expect(state.time).toBe(4);
    expect(state.inventory['roasted-chestnut']).toBe(1);
    // repeating: stays armed for a live driver (or another wait()) to continue.
    expect(state.activeAction).not.toBeNull();
  });
});

describe('armCraft / craftFirstUnit', () => {
  const MODULE = `
# item raw-shrimp
examine: Fresh-caught shrimp, raw.

# recipe cook
time: 2
in: 1 raw-shrimp
out: 1 cooked-shrimp
`;

  it('craftFirstUnit reports the duration without mutating state', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    state.inventory['raw-shrimp'] = 1;
    expect(craftFirstUnit('cook', registry, state)).toBe(2);
    expect(state.activeAction).toBeNull();
  });

  it('craftFirstUnit falls back to 0 for an unknown recipe', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    expect(craftFirstUnit('no-such-recipe', registry, state)).toBe(0);
  });

  it('armCraft arms without resolving; craft() (armCraft + resolve) still completes as before', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    state.inventory['raw-shrimp'] = 1;

    const armed = armCraft('cook', registry, state);
    expect(armed).toEqual({ armed: true, firstUnit: 2 });
    expect(state.time).toBe(0);
    expect(state.inventory['cooked-shrimp'] ?? 0).toBe(0);
    expect(state.inventory['raw-shrimp']).toBe(1); // not consumed until resolve()

    craft('cook', registry, state);
    expect(state.time).toBe(2);
    expect(state.inventory['cooked-shrimp']).toBe(1);
  });
});
