import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { Condition, ENGINE_ROOT_NAMES } from '../grammar/condition';
import {
  actionFirstUnit, applyResultsNow, armAction, armCraft, armFightAction, craft, craftFirstUnit, createGameState, evaluateCondition, GameState, initResources, renderSegments, resolve, travelSeconds, useAction } from './runtime';
import { travelAction } from './actionLookup';
import { IMPLICIT_TARGET_FULL } from './encounter';
import { restorePools } from './effects';
import type { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { PLAYER_FIELDS, PLAYER_SHEET } from './state';
import { secondsToMs, toMilliUnits } from './units';
import { DEFAULT_LANGUAGE } from '../grammar/section';
import { mintedName } from '../grammar/values';
import { runTest } from './session';

const MODULE = `
# location guide-house
x: 0, y: 0
starting

# entity front-door
open: relocate: guide-house, say: The door swings open.

# flag quest-given

# entity miki

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

# flag unlocked

# test main
run: enter
talk: miki
choose: 0
use: entity.front-door.open
assert: quest-given

# test failing
talk: miki
choose: 1
assert: unlocked
`;

describe('runTest', () => {
  it('passes a script that talks, chooses, uses an action, and composes another test via run:', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    const result = runTest('main', registry, state);
    expect(result).toEqual({ passed: true });
    expect(state.location).toBe('guide-house');
    expect(state.flags['quest-given']).toBe(true);
  });

  it('fails and reports the unmet condition when an expect does not hold', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    const result = runTest('failing', registry, state);
    expect(result.passed).toBe(false);
    expect(result.failure).toBe('unlocked');
  });
});

describe('travelSeconds', () => {
  it('reads the authored travel-seconds variable', () => {
    const registry = loadInEnglish('# variable travel-seconds\nvalue: 7');
    expect(travelSeconds(registry)).toBe(7);
  });

  it('falls back to the engine default when content omits the variable', () => {
    const registry = loadInEnglish('# location camp\nx: 0, y: 0\nstarting');
    expect(travelSeconds(registry)).toBe(3);
  });

  it('falls back to the default when the variable is declared with an empty value', () => {
    const registry = loadInEnglish('# variable travel-seconds');
    expect(travelSeconds(registry)).toBe(3);
  });

  it('costs the same wherever the road runs, however far apart the map draws its ends', () => {
    const registry = loadInEnglish(
      '# variable travel-seconds\nvalue: 4\n\n# location camp\nx: 0, y: 0\nstarting\nadjacent:\n  near\n  far\n\n# location near\nx: 1, y: 0\n\n# location far\nx: 40, y: 30\n',
    );
    expect(travelAction('camp', 'near', registry).time).toBe(4);
    expect(travelAction('camp', 'far', registry).time).toBe(4);
  });
});

describe('evaluateCondition', () => {
  const registry = loadInEnglish('');
  const ref = (...path: string[]): Condition => ({ kind: 'reference', reference: { path } });

  it('treats a bare reference as a truthiness check', () => {
    const state = createGameState();
    expect(evaluateCondition(ref('unlocked'), state, registry)).toBe(false);
    state.flags.unlocked = true;
    expect(evaluateCondition(ref('unlocked'), state, registry)).toBe(true);
  });

  it('reads a node visit counter off a dotted <node-name>.visits reference', () => {
    const state = createGameState();
    state.visits.toll = 5;
    expect(evaluateCondition({ kind: 'comparison', left: { path: ['toll', 'visits'] }, operator: '>=', right: { value: 5, places: 0 } }, state, registry)).toBe(true);
    expect(evaluateCondition({ kind: 'comparison', left: { path: ['toll', 'visits'] }, operator: '>=', right: { value: 6, places: 0 } }, state, registry)).toBe(false);
  });

  it('combines with not/and/or', () => {
    const state = createGameState();
    state.flags.a = true;
    expect(evaluateCondition({ kind: 'not', condition: ref('a') }, state, registry)).toBe(false);
    expect(evaluateCondition({ kind: 'and', conditions: [ref('a'), ref('b')] }, state, registry)).toBe(false);
    expect(evaluateCondition({ kind: 'or', conditions: [ref('a'), ref('b')] }, state, registry)).toBe(true);
  });

  it('checks a has condition against live inventory counts', () => {
    const state = createGameState();
    expect(evaluateCondition({ kind: 'has', item: 'lockpick', count: 1 }, state, registry)).toBe(false);
    state.inventory.lockpick = 1;
    expect(evaluateCondition({ kind: 'has', item: 'lockpick', count: 1 }, state, registry)).toBe(true);
    expect(evaluateCondition({ kind: 'has', item: 'cooked-shrimp', count: 5 }, state, registry)).toBe(false);
    state.inventory['cooked-shrimp'] = 4;
    expect(evaluateCondition({ kind: 'has', item: 'cooked-shrimp', count: 5 }, state, registry)).toBe(false);
    state.inventory['cooked-shrimp'] = 5;
    expect(evaluateCondition({ kind: 'has', item: 'cooked-shrimp', count: 5 }, state, registry)).toBe(true);
  });
});

describe('applyResult', () => {
  const registry = loadInEnglish('');

  it('sets and unsets flags', () => {
    const state = createGameState();
    applyResultsNow(state, registry, [{ kind: 'set', variable: 'unlocked' }]);
    expect(state.flags.unlocked).toBe(true);
    applyResultsNow(state, registry, [{ kind: 'unset', variable: 'unlocked' }]);
    expect(state.flags.unlocked).toBeUndefined();
  });

  it('gives and takes inventory counts', () => {
    const state = createGameState();
    applyResultsNow(state, registry, [{ kind: 'give', item: 'cooked-shrimp', amount: point(5) }]);
    applyResultsNow(state, registry, [{ kind: 'take', item: 'cooked-shrimp', amount: 2 }]);
    expect(state.inventory['cooked-shrimp']).toBe(3);
  });

  it('leaves all 2 held where they are when a take asks for 5, rather than emptying what is there', () => {
    const state = createGameState();
    applyResultsNow(state, registry, [{ kind: 'give', item: 'cooked-shrimp', amount: point(2) }]);
    applyResultsNow(state, registry, [{ kind: 'take', item: 'cooked-shrimp', amount: 5 }]);
    expect(state.inventory['cooked-shrimp']).toBe(2);
  });

  it('adds to a numeric flag, treating an absent or boolean-true base as 0', () => {
    const state = createGameState();
    applyResultsNow(state, registry, [{ kind: 'add', variable: 'rats-killed', amount: 1 }]);
    expect(state.flags['rats-killed']).toBe(1);
    applyResultsNow(state, registry, [{ kind: 'add', variable: 'rats-killed', amount: 1 }]);
    expect(state.flags['rats-killed']).toBe(2);

    state.flags.snubbed = true;
    applyResultsNow(state, registry, [{ kind: 'add', variable: 'snubbed', amount: 3 }]);
    expect(state.flags.snubbed).toBe(3);
  });

  it('flips a >= count condition true once enough add: increments land', () => {
    const state = createGameState();
    const condition: Condition = { kind: 'comparison', left: { path: ['rats-killed'] }, operator: '>=', right: { value: 3, places: 0 } };
    expect(evaluateCondition(condition, state, registry)).toBe(false);
    applyResultsNow(state, registry, [{ kind: 'add', variable: 'rats-killed', amount: 1 }]);
    applyResultsNow(state, registry, [{ kind: 'add', variable: 'rats-killed', amount: 1 }]);
    expect(evaluateCondition(condition, state, registry)).toBe(false);
    applyResultsNow(state, registry, [{ kind: 'add', variable: 'rats-killed', amount: 1 }]);
    expect(evaluateCondition(condition, state, registry)).toBe(true);
  });

  it('accumulates xp and moves location on relocate/discover', () => {
    const state = createGameState();
    applyResultsNow(state, registry, [{ kind: 'xp', skill: 'thieving', amount: point(4) }]);
    applyResultsNow(state, registry, [{ kind: 'relocate', location: 'beach' }]);
    applyResultsNow(state, registry, [{ kind: 'discover', location: 'bank' }]);
    expect(state.xp.thieving).toBe(4);
    expect(state.location).toBe('beach');
    expect(state.flags['bank.discovered']).toBe(true);
  });

  it('logs and stacks a modal on open-modal', () => {
    const state = createGameState();
    applyResultsNow(state, registry, [{ kind: 'open-modal', modal: 'choose-name' }]);
    expect(state.log).toEqual([expect.stringContaining(mintedName('choose-name', DEFAULT_LANGUAGE))]);
    expect(state.modals.map((frame) => frame.name)).toEqual(['choose-name']);
  });
});

describe('useAction: take affordability and graceful failure', () => {
  const TAKE_MODULE = `
# item cooked-shrimp
title: Cooked Shrimp

# entity brazier
flags: brazier-lit
light:
  take: 2 cooked-shrimp
  set: brazier-lit
  on success:
    say: The brazier roars to life.

# entity shrine
flags: shrine-offered
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

# location hallway
x: 5, y: 0

# entity door
open:
  relocate: hallway
  say: The door creaks open.
  on success:
    say: You step through.
`;

  it('consumes items and fires on success when affordable', () => {
    const registry = loadInEnglish(TAKE_MODULE);
    const state = createGameState();
    state.inventory['cooked-shrimp'] = 2;
    useAction('entity', 'brazier', 'light', registry, state);
    expect(state.inventory['cooked-shrimp']).toBe(0);
    expect(state.flags['brazier.brazier-lit']).toBe(true);
    expect(state.log).toEqual(['The brazier roars to life.']);
  });

  it('fires an authored on failure, applies nothing else, and leaves inventory untouched when unaffordable', () => {
    const registry = loadInEnglish(TAKE_MODULE);
    const state = createGameState();
    state.inventory['cooked-shrimp'] = 1;
    useAction('entity', 'shrine', 'offer', registry, state);
    expect(state.inventory['cooked-shrimp']).toBe(1);
    expect(state.flags['shrine.shrine-offered']).toBeUndefined();
    expect(state.log).toEqual(['The shrine rejects your empty hands.']);
  });

  it('falls back to a generated message naming the item title when no on failure is authored', () => {
    const registry = loadInEnglish(TAKE_MODULE);
    const state = createGameState();
    useAction('entity', 'brazier', 'light', registry, state);
    expect(state.inventory['cooked-shrimp'] ?? 0).toBe(0);
    expect(state.flags['brazier.brazier-lit']).toBeUndefined();
    expect(state.log).toEqual(["You don't have enough Cooked Shrimp."]);
  });

  it('fails atomically: an unaffordable action does not apply its other results', () => {
    const registry = loadInEnglish(TAKE_MODULE);
    const state = createGameState();
    useAction('entity', 'shrine', 'offer', registry, state);
    expect(state.flags['shrine.shrine-offered']).toBeUndefined();
  });

  it('sums multiple take: results on the same item before checking affordability', () => {
    const registry = loadInEnglish(TAKE_MODULE);

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
    const registry = loadInEnglish(TAKE_MODULE);
    const state = createGameState();
    useAction('entity', 'door', 'open', registry, state);
    expect(state.location).toBe('hallway');
    expect(state.log).toEqual(['The door creaks open.', 'You step through.']);
  });
});

describe('an action that sets the flag it hides on', () => {
  const ONCE_MODULE = `
# item trinket
title: Trinket

# entity drawer
flags: searched
search:
  hidden if: searched
  give: trinket
  set: searched
`;

  it('gives once, and refuses the second reach rather than giving again', () => {
    const registry = loadInEnglish(ONCE_MODULE);
    const state = createGameState();

    useAction('entity', 'drawer', 'search', registry, state);
    expect(state.inventory['trinket']).toBe(1);

    expect(() => useAction('entity', 'drawer', 'search', registry, state)).toThrow(/action hidden/);
    expect(state.inventory['trinket']).toBe(1);
  });
});

describe('renderSegments', () => {
  const registry = loadInEnglish('');

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
      registry,
    );
    expect(rendered).toBe('Hello  already answered');
  });

  const sheetLine = (state: GameState, held: Registry): string =>
    renderSegments(
      [
        { kind: 'literal', text: 'There you are, ' },
        { kind: 'interpolate', reference: { path: ['player', 'name'] } },
        { kind: 'literal', text: ', ' },
        { kind: 'interpolate', reference: { path: ['player', 'race'] } },
        { kind: 'literal', text: '.' },
      ],
      state,
      held,
    );

  it('writes the name the player typed and the words the world titles their race, never the race id', () => {
    const held = loadInEnglish(['# race high-elf', 'title: Elf of the High Wood'].join('\n'));
    const state = createGameState();
    state.player = { name: 'Rowan', race: 'high-elf' };
    expect(sheetLine(state, held)).toBe('There you are, Rowan, Elf of the High Wood.');
    expect(evaluateCondition({ kind: 'reference', reference: { path: ['player', 'race'] } }, state, held)).toBe(true);
  });

  it('writes nothing at all for a race nobody has been asked for yet', () => {
    expect(sheetLine(createGameState(), registry)).toBe('There you are, , .');
  });

  for (const field of PLAYER_FIELDS) {
    const { names } = PLAYER_SHEET[field];
    it(`reads player.${field} out as ${names === null ? 'the words the player typed' : `the words the world titles a ${names}`}`, () => {
      const held = names === null ? registry : loadInEnglish([`# ${names} a-sample`, 'title: Words The World Owns'].join('\n'));
      const state = createGameState();
      state.player[field] = names === null ? 'Words The Player Typed' : 'a-sample';
      const rendered = renderSegments([{ kind: 'interpolate', reference: { path: ['player', field] } }], state, held);
      expect(rendered).toBe(names === null ? 'Words The Player Typed' : 'Words The World Owns');
    });
  }

  it('renders an unset player.name as empty text', () => {
    const state = createGameState();
    const rendered = renderSegments([{ kind: 'interpolate', reference: { path: ['player', 'name'] } }], state, registry);
    expect(rendered).toBe('');
  });
});

describe('armAction / actionFirstUnit: arming a spannable action without resolving it (live-mode support)', () => {
  const MODULE = `
# item roasted-chestnut
examine: Split and steaming.

# entity oven
roast:
  continuous
  time: 4
  give: 1 roasted-chestnut

# entity door
open:
  say: The door creaks open.
`;

  it('actionFirstUnit reports the first-unit duration for a spannable action without mutating state', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    const duration = actionFirstUnit('entity', 'oven', 'roast', registry, state);
    expect(duration).toBe(secondsToMs(4));
    expect(state.activeAction).toBeNull();
    expect(state.time).toBe(0);
  });

  it('actionFirstUnit reports 0 for an instant action (no time:)', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    expect(actionFirstUnit('entity', 'door', 'open', registry, state)).toBe(0);
  });

  it('actionFirstUnit falls back to 0 for an unknown action or object, mutating nothing', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    expect(actionFirstUnit('entity', 'oven', 'bogus', registry, state)).toBe(0);
    expect(actionFirstUnit('entity', 'no-such-entity', 'anything', registry, state)).toBe(0);
    expect(state.activeAction).toBeNull();
  });

  it('armAction sets activeAction and reports firstUnit WITHOUT resolving any of it', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    const result = armAction('entity', 'oven', 'roast', registry, state);
    expect(result).toEqual({ armed: true, firstUnit: secondsToMs(4) });
    expect(state.activeAction).toEqual({ ownerRef: 'entity.oven', actionSlug: 'roast', repeating: true, implicitTarget: IMPLICIT_TARGET_FULL, cadences: { player: { progress: 0, attemptsMade: 0 } }, roster: { player: { ownerRef: 'entity.oven', actionSlug: 'roast', target: 'oven' } } });
    expect(state.time).toBe(0);
    expect(state.inventory['roasted-chestnut'] ?? 0).toBe(0);
  });

  it('useAction (armAction immediately followed by resolve) still completes the first unit instantly, unchanged', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    useAction('entity', 'oven', 'roast', registry, state);
    expect(state.time).toBe(secondsToMs(4));
    expect(state.inventory['roasted-chestnut']).toBe(1);
    expect(state.activeAction).not.toBeNull();
  });
});

describe('armCraft / craftFirstUnit', () => {
  const MODULE = `
# item raw-shrimp
examine: Fresh-caught shrimp, raw.

# item cooked-shrimp
examine: Hot and pink.

# recipe cook
time: 2
in: 1 raw-shrimp
out: 1 cooked-shrimp
`;

  it('craftFirstUnit reports the duration without mutating state', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    state.inventory['raw-shrimp'] = 1;
    expect(craftFirstUnit('cook', registry, state)).toBe(secondsToMs(2));
    expect(state.activeAction).toBeNull();
  });

  it('craftFirstUnit falls back to 0 for an unknown recipe', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    expect(craftFirstUnit('no-such-recipe', registry, state)).toBe(0);
  });

  it('armCraft arms without resolving; craft() (armCraft + resolve) still completes as before', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    state.inventory['raw-shrimp'] = 1;

    const armed = armCraft('cook', registry, state);
    expect(armed).toEqual({ armed: true, firstUnit: secondsToMs(2) });
    expect(state.time).toBe(0);
    expect(state.inventory['cooked-shrimp'] ?? 0).toBe(0);
    expect(state.inventory['raw-shrimp']).toBe(1);

    craft('cook', registry, state);
    expect(state.time).toBe(secondsToMs(2));
    expect(state.inventory['cooked-shrimp']).toBe(1);
  });
});

const DRAIN_MODULE =
  FIXTURE_WORLD +
  `
# stat max-vigor
base: 30

# stat max-sap
base: 30

# stat sap-seep

# stat max-ichor
base: 30

# stat max-ash
base: 30

# item trophy

# resource vigor
max: max-vigor

# resource sap
rate: sap-seep
max: max-sap

# resource ichor
max: max-ichor

# resource ash
max: max-ash

# event vigor-gone
resource: vigor
trigger: on empty

# event sap-gone
resource: sap
trigger: on empty

# event ichor-gone
resource: ichor
trigger: on empty

# event ash-settled
resource: ash
trigger: on empty

# entity player
on vigor-gone:
  say: Your vigor gutters out.
  stop
on sap-gone:
  say: The sap runs dry.
  stop
on ichor-gone:
  say: The ichor runs out.
  stop
on ash-settled:
  say: The ash settles.

# location camp
entities: grindstone, millstone, wheel, bellows

# entity grindstone
grind:
  continuous
  time: 1
  give: 1 trophy
  on success:
    drain: 12 vigor

# entity millstone
grind:
  continuous
  time: 1
  -300 sap-seep
  give: 1 trophy
  on success:
    drain: 12 sap

# entity wheel
turn:
  continuous
  time: 1
  give: 1 trophy
  on success:
    one of:
      1x: drain: 12 ichor
      1x: drain: 4 ichor

# entity bellows
work:
  continuous
  time: 1
  give: 1 trophy
  on success:
    drain: 12 ash
`;

describe('a deterministic batch settles `on empty:` at the completion that drains the pool', () => {
  function grinding(entity: string, action: string, splits: number[]): GameState {
    const registry = loadInEnglish(DRAIN_MODULE);
    const state = createGameState('camp');
    initResources(state, registry);
    armAction('entity', entity, action, registry, state);
    for (const seconds of splits) resolve(state, registry, secondsToMs(seconds));
    return state;
  }

  function agreesWithOneShot(entity: string, action: string, oneShot: GameState, splitSets: number[][]): void {
    for (const splits of splitSets) {
      const folded = grinding(entity, action, splits);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.resources).toEqual(oneShot.resources);
      expect(folded.log).toEqual(oneShot.log);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
      expect(folded.time).toBe(oneShot.time);
    }
  }

  it('banks the third grind and no more over a 200s span, one-shot or split at 3s or 10s', () => {
    const oneShot = grinding('grindstone', 'grind', [200]);

    expect(oneShot.inventory['trophy']).toBe(3);
    expect(oneShot.resources['vigor']).toBe(0);
    expect(oneShot.activeAction).toBeNull();
    expect(oneShot.log.filter((line) => line === 'Your vigor gutters out.')).toHaveLength(1);
    expect(oneShot.time).toBe(secondsToMs(200));

    agreesWithOneShot('grindstone', 'grind', oneShot, [[3, 200], [10, 200], [1, 2, 3, 4, 200], [2.5, 7.5, 60, 200]]);
  });

  it('reads a rate settling the same pool, which crosses zero a grind before the results alone would', () => {
    const oneShot = grinding('millstone', 'grind', [200]);

    expect(oneShot.inventory['trophy']).toBe(2);
    expect(oneShot.resources['sap']).toBe(0);
    expect(oneShot.activeAction).toBeNull();
    expect(oneShot.log.filter((line) => line === 'The sap runs dry.')).toHaveLength(1);

    agreesWithOneShot('millstone', 'grind', oneShot, [[2, 200], [3, 200], [1, 2, 3, 200], [0.5, 6, 200]]);
  });

  it('walks a drain it cannot plan — one drawn from a selector — a completion at a time', () => {
    const oneShot = grinding('wheel', 'turn', [200]);

    expect(oneShot.inventory['trophy']).toBe(4);
    expect(oneShot.resources['ichor']).toBe(0);
    expect(oneShot.activeAction).toBeNull();
    expect(oneShot.log.filter((line) => line === 'The ichor runs out.')).toHaveLength(1);

    agreesWithOneShot('wheel', 'turn', oneShot, [[4, 200], [10, 200], [1, 2, 3, 4, 5, 200], [3.5, 60, 200]]);
  });

  it('goes back to batching once the pool is empty, because an empty one cannot empty again', () => {
    const oneShot = grinding('bellows', 'work', [200]);

    expect(oneShot.inventory['trophy']).toBe(200);
    expect(oneShot.resources['ash']).toBe(0);
    expect(oneShot.activeAction).not.toBeNull();
    expect(oneShot.log.filter((line) => line === 'The ash settles.')).toHaveLength(1);

    agreesWithOneShot('bellows', 'work', oneShot, [[3, 200], [10, 200], [1, 2, 3, 4, 200], [2.5, 7.5, 60, 200]]);
  });
});

describe('what an engine root reads', () => {
  const registry = loadInEnglish('');
  const reads = (path: string[], state: GameState, right: number): boolean => evaluateCondition({ kind: 'comparison', left: { path }, operator: '=', right: { value: right, places: 0 } }, state, registry);

  it('reads an xp total, a pool and a held count as numbers a comparison can bound', () => {
    const state = createGameState();
    state.xp['island.thieving'] = 4;
    restorePools(state, { 'island.health': toMilliUnits(12) });
    state.inventory['island.plank'] = 3;

    expect(reads(['xp', 'island', 'thieving'], state, 4)).toBe(true);
    expect(reads(['xp', 'island', 'thieving'], state, 5)).toBe(false);
    expect(reads(['resource', 'island', 'health'], state, 12)).toBe(true);
    expect(reads(['inventory', 'island', 'plank'], state, 3)).toBe(true);
  });

  it('reads nothing it holds as zero rather than as absent, so a bound holds before the first grant', () => {
    const state = createGameState();
    expect(reads(['xp', 'island', 'thieving'], state, 0)).toBe(true);
    expect(reads(['resource', 'island', 'health'], state, 0)).toBe(true);
    expect(reads(['inventory', 'island', 'plank'], state, 0)).toBe(true);
  });

  it.each(ENGINE_ROOT_NAMES)('does not let a flag named after %s answer for it', (root) => {
    const state = createGameState();
    const path = [root, 'island', 'anything'];
    const before = renderSegments([{ kind: 'interpolate', reference: { path } }], state, registry);
    state.flags[path.join('.')] = 99;

    expect(renderSegments([{ kind: 'interpolate', reference: { path } }], state, registry)).toBe(before);
  });
});

describe('a rate that names a side is paced by the side it names', () => {
  const WATERS = `
# stat depth
base: 0

# item fish
examine: A fish.

# entity shallow-water
stats: depth 60
cast:
  continuous
  rate: their depth
  give: 1 fish

# entity deep-water
stats: depth 6
cast:
  continuous
  rate: their depth
  give: 1 fish
`;

  const casting = (registry: Registry, water: string, forMs: number): GameState => {
    const state = createGameState();
    armAction('entity', water, 'cast', registry, state);
    resolve(state, registry, forMs);
    return state;
  };

  it('reads the stat off what the action is aimed at rather than off the player, who declares none of it', () => {
    const registry = loadInEnglish(WATERS);
    const state = createGameState();

    expect(actionFirstUnit('entity', 'shallow-water', 'cast', registry, state)).toBe(secondsToMs(1));
    expect(actionFirstUnit('entity', 'deep-water', 'cast', registry, state)).toBe(secondsToMs(10));
  });

  it('runs the world at that pace, so the two waters pay out at rates of their own', () => {
    const registry = loadInEnglish(WATERS);
    const shallow = casting(registry, 'shallow-water', secondsToMs(30));
    const deep = casting(registry, 'deep-water', secondsToMs(30));

    expect(shallow.inventory['fish'] ?? 0, 'a water the player cannot pace reels in nothing at all').toBeGreaterThan(0);
    expect(shallow.inventory['fish']!).toBeGreaterThan(deep.inventory['fish'] ?? 0);
  });
});

describe('a debuff an enemy lands mid-fight leaves every step size in the same place', () => {
  const DEN = `
# stat attack
base: 10

# stat accuracy
base: 50

# stat evasion
base: 10

# stat defense

# stat attack-rate
base: 25

# stat max-health
base: 200

# resource health
max: max-health

# event death
resource: health
trigger: on empty

# item cold-iron
examine: Your arms will not do what you tell them.
-100% attack-rate, 3s

# item rat-tail
examine: Still twitching.

# location den
x: 0, y: 0
starting
entities: giant-rat

# action fight
title: fight
continuous
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health

# entity player
stats: attack 10, accuracy 50, evasion 10, defense 0, max-health 200, attack-rate 25
uses: fight

# entity giant-rat
stats: attack 4, accuracy 50, evasion 10, defense 2, max-health 30, attack-rate 16
uses: fight
on hit: inflict: cold-iron on them
on death:
  give: 1 rat-tail
`;

  const SPAN = secondsToMs(120);

  const settledOn = (registry: Registry, seed: number, step: number): string => {
    const state = createGameState('den');
    initResources(state, registry);
    state.rng = seed;
    armFightAction('fight', 'giant-rat', registry, state);
    for (let at = step; at < SPAN; at += step) resolve(state, registry, at);
    resolve(state, registry, SPAN);
    const { log, ...rest } = state;
    return JSON.stringify(rest);
  };

  it.each([1, 12345, 999])('walks the same fight to the same state at every step, on seed %i', (seed) => {
    const registry = loadInEnglish(DEN);
    const oneStep = settledOn(registry, seed, SPAN);

    for (const step of [50, 137, 200, 1000, 7000]) {
      expect(settledOn(registry, seed, step), `stepped every ${step}ms`).toBe(oneStep);
    }
  });

  it('is a fight the stall actually decides, so the claim above is about the debuff', () => {
    const registry = loadInEnglish(DEN);
    const stalled = createGameState('den');
    initResources(stalled, registry);
    stalled.rng = 12345;
    armFightAction('fight', 'giant-rat', registry, stalled);
    resolve(stalled, registry, SPAN);

    const unhindered = loadInEnglish(DEN.replace('on hit: inflict: cold-iron on them', ''));
    const free = createGameState('den');
    initResources(free, unhindered);
    free.rng = 12345;
    armFightAction('fight', 'giant-rat', unhindered, free);
    resolve(free, unhindered, SPAN);

    expect(free.resources['health']!, 'a player held still takes far more of the fight than one who is not').toBeGreaterThan(stalled.resources['health']!);
  });
});
