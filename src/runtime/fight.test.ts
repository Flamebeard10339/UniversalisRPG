import { describe, expect, it } from 'vitest';
import { armFightAction, createGameState, GameState, initResources, PLAYER, resolve } from './runtime';
import { hostile, Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { diffState, initialState, loadSave, SAVE_VERSION } from './save';
import { logSwing } from './encounter';
import { isPopulations } from './population';
import { secondsToMs, toMilliUnits } from './units';

// One block, brought by whoever swings, and three factions: the player and miki
// share one, the bandits share another, and the crab is in neither so it is
// hostile to both. Every entity is measured by its own sheet.
const MODULE = `
# stat attack
base: 4

# stat dr

# stat attack-rate
base: 60

# stat max-health

# resource health
max: max-health

# event death
resource: health
trigger: on empty

# flag truce

# flag gave-up

# item token

# item bandit-ear

# faction world

# faction player

# faction bandits

# action swing
title: swing
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

# entity player
faction: player
stats: max-health 1000, attack 4, attack-rate 60
uses: swing
allies: miki

# entity miki
faction: player
stats: max-health 1000, attack 4, attack-rate 60
uses: swing

# entity bandit
faction: bandits
stats: max-health 1000, attack 4, attack-rate 60
uses: swing
on death:
  credit:
    give: 1 bandit-ear

# entity bandit-leader
faction: bandits
stats: max-health 8, attack 4, attack-rate 60
uses: swing
allies: 2 bandit
on death:
  credit:
    give: 1 token

# entity crab
stats: max-health 12, attack 4, attack-rate 60
uses: swing
aggressive
respawn after: 30s
on death:
  credit:
    give: 1 token

# entity boulder
stats: max-health 8, attack 4, attack-rate 60
uses: swing
swing:
  +hidden if: truce

// The same declaration, performed differently: this one hits for its own
// hard-blow stat and swings at its own pace, and neither is on # action swing.
# stat hard-blow
base: 40

# entity ogre
stats: max-health 1000, attack 4, attack-rate 60, hard-blow 40
uses: swing
swing:
  damage: my hard-blow vs their dr
  rate: 30

# entity urchin
stats: max-health 100000, attack 4, attack-rate 60
uses: swing
aggressive

// A gate on the declaration, so an overload has something to replace and
// something to append to.
# action guarded
title: guarded
requires: truce
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

# entity warden
stats: max-health 8, attack 4, attack-rate 60
uses: guarded
guarded:
  +requires: has token

# entity gatekeeper
stats: max-health 8, attack 4, attack-rate 60
uses: guarded
guarded:
  requires: has token

# location camp
x: 0, y: 0
starting
entities: 2 bandit-leader, boulder, ogre

# location shore
x: 1, y: 0
entities: 3 crab

# location reef
x: 2, y: 0
entities: urchin
`;

function loaded(): Registry {
  return loadInEnglish(MODULE);
}

function standing(registry: Registry, where: string): GameState {
  const state = createGameState(where);
  initResources(state, registry);
  return state;
}

const entity = (registry: Registry, id: string) => registry.entities.get(id)!;

describe('hostility is derived from factions and is symmetric', () => {
  it('makes two entities hostile exactly when they share no bit', () => {
    const registry = loaded();
    for (const [a, b, expected] of [
      ['player', 'miki', false],
      ['player', 'bandit', true],
      ['bandit', 'bandit-leader', false],
      // `crab` names no faction, so it is `world` — which the player, in
      // `player` alone, shares no bit with.
      ['player', 'crab', true],
      ['crab', 'bandit', true],
    ] as const) {
      expect(hostile(registry, entity(registry, a), entity(registry, b)), `${a} vs ${b}`).toBe(expected);
      expect(hostile(registry, entity(registry, b), entity(registry, a)), `${b} vs ${a}`).toBe(expected);
    }
  });

  it('compiles names to bits rather than reading a number off the page', () => {
    const registry = loaded();
    expect([...registry.factionBits.keys()]).toEqual(['world', 'player', 'bandits']);
    expect(registry.factionBits.get('world')).toBe(1);
    expect(new Set(registry.factionBits.values()).size).toBe(3);
  });
});

describe('aggressive opens the fight, and a location bounds it', () => {
  it('opens against a hostile entity in its location with nothing armed', () => {
    const registry = loaded();
    const state = standing(registry, 'shore');

    resolve(state, registry, secondsToMs(1));
    expect(state.activeAction).not.toBeNull();
    expect(state.activeAction!.roster!['crab'].target).toBe(PLAYER);
    expect(state.log.some((line) => line.startsWith('The Crab hits you'))).toBe(true);
  });

  it('leaves the player alone where nothing hostile is aggressive', () => {
    const registry = loaded();
    const state = standing(registry, 'camp');

    resolve(state, registry, secondsToMs(5));
    expect(state.activeAction).toBeNull();
  });

  // Travelling out is how a fight is broken off, and it needs no authored
  // leash. The urchin outlasts the span by four orders of magnitude, so the
  // fight ending is the leash and never the fight being won.
  it('disengages when the target is no longer where the fight is', () => {
    const registry = loaded();
    const state = standing(registry, 'reef');
    armFightAction('swing', 'urchin', registry, state);

    resolve(state, registry, secondsToMs(20));
    expect(state.activeAction).not.toBeNull();
    expect(state.activeAction!.actors!['urchin'].resources['health']).toBeGreaterThan(0);

    state.location = 'camp';
    resolve(state, registry, secondsToMs(21));
    expect(state.activeAction).toBeNull();
  });
});

describe('allies: is a roster, not a filter over what the location holds', () => {
  it('mints one fight-scoped copy per count and joins a named one from wherever it is', () => {
    const registry = loaded();
    const state = standing(registry, 'camp');
    armFightAction('swing', 'bandit-leader', registry, state);

    // Two bandits from the leader's count, the leader itself, and miki — who
    // stands in no location at all and joins by name.
    expect(Object.keys(state.activeAction!.actors!).sort()).toEqual(['bandit#1', 'bandit#2', 'bandit-leader', 'miki']);
    expect(state.activeAction!.roster!['bandit#1'].target).toBe(PLAYER);
    expect(state.activeAction!.roster!['miki'].target).toBe('bandit-leader');
  });

  it('keeps the fight running rather than disengaging from a participant who stands nowhere', () => {
    const registry = loaded();
    const state = standing(registry, 'camp');
    armFightAction('swing', 'bandit-leader', registry, state);

    resolve(state, registry, secondsToMs(0.5));
    expect(state.activeAction).not.toBeNull();
    expect(Object.keys(state.activeAction!.actors!)).toContain('bandit#1');
  });

  it('lets an ally land the killing blow, which ends the fight and fires the death once', () => {
    const registry = loaded();
    const state = standing(registry, 'camp');
    armFightAction('swing', 'bandit-leader', registry, state);
    // The leader has 8 health against 4 a hit; miki and the player both swing
    // at 60/min, so miki's second hit at t=2 is the one that lands last.
    resolve(state, registry, secondsToMs(4));

    expect(state.activeAction).toBeNull();
    expect(state.inventory['token']).toBe(1);
    expect(state.populations['camp']['bandit-leader']).toEqual({ down: 1, due: [] });
    // A swing between two participants that are neither of them the player is
    // still a swing, and the log says who it landed on.
    expect(state.log.some((line) => /^The Miki hits the Bandit Leader for /.test(line))).toBe(true);
    expect(state.log.some((line) => /^The Miki hits you/.test(line))).toBe(false);
  });

  it('answers an event on a fight-scoped copy, which has no entry in the registry of its own', () => {
    const registry = loaded();
    const state = standing(registry, 'camp');
    armFightAction('swing', 'bandit-leader', registry, state);

    // A minted copy is keyed by its type and which copy it is, and nothing in
    // the registry answers to that key: its template is what answers for it.
    expect(registry.entities.has('bandit#1')).toBe(false);
    state.activeAction!.actors!['bandit#1'].resources['health'] = toMilliUnits(1);
    state.activeAction!.roster![PLAYER].target = 'bandit#1';
    resolve(state, registry, secondsToMs(1));
    expect(state.inventory['bandit-ear']).toBe(1);
  });
});

describe('an overload governs its own entity performance', () => {
  // Everything the overload says, not only the gates it writes: what swings is
  // the performer's own copy of the declaration.
  it('is what swings, so its damage: and rate: are the ones that land', () => {
    const registry = loaded();
    const state = standing(registry, 'camp');
    armFightAction('swing', 'ogre', registry, state);

    // The ogre's own copy: 40 a hit at 30/min, so one bite of 40 lands by t=2
    // where the declaration would have landed two of 4.
    resolve(state, registry, secondsToMs(2));
    expect(toMilliUnits(1000) - state.resources['health']).toBe(toMilliUnits(40));
  });

  it('replaces what it names bare and adds to what it names with +', () => {
    const registry = loaded();
    const declaration = registry.actions.get('swing')!;
    const overloaded = registry.entities.get('ogre')!.actions[0];

    // Bare: the overload's damage: stands in for the declaration's, and what
    // it does not name is inherited.
    expect(declaration.damage).toEqual({ left: { side: 'my', id: 'attack' }, right: { side: 'their', id: 'dr' } });
    expect(overloaded.damage).toEqual({ left: { side: 'my', id: 'hard-blow' }, right: { side: 'their', id: 'dr' } });
    expect(overloaded.depletes).toEqual(declaration.depletes);
  });

  // The declaration carries a gate here, so replacing and appending are two
  // different answers rather than the same one.
  it('tells a bare line from a + line where the declaration already holds one', () => {
    const registry = loaded();
    const truce = { kind: 'reference', reference: { path: ['truce'] } };
    const hasToken = { kind: 'has', item: 'token', count: 1 };

    expect(registry.actions.get('guarded')!.requires).toEqual(truce);
    expect(registry.entities.get('warden')!.actions[0].requires).toEqual({ kind: 'and', conditions: [truce, hasToken] });
    expect(registry.entities.get('gatekeeper')!.actions[0].requires).toEqual(hasToken);
  });

  it('stops that entity swinging without removing it', () => {
    const registry = loaded();
    const gated = standing(registry, 'camp');
    gated.flags['truce'] = true;
    armFightAction('swing', 'boulder', registry, gated);
    resolve(gated, registry, secondsToMs(5));

    const open = standing(registry, 'camp');
    armFightAction('swing', 'boulder', registry, open);
    resolve(open, registry, secondsToMs(5));

    // The boulder is fought either way; only its own answer is gated.
    expect(gated.resources['health']).toBe(toMilliUnits(1000));
    expect(open.resources['health']).toBeLessThan(toMilliUnits(1000));
  });
});

describe('respawn after: is the thing own fact, and the count is the place own', () => {
  it('brings a copy back at its due instant and not before', () => {
    const registry = loaded();
    const state = standing(registry, 'shore');
    armFightAction('swing', 'crab', registry, state);
    resolve(state, registry, secondsToMs(3)); // 12 health at 4 a hit, one a second

    const due = state.populations['shore']['crab'].due;
    expect(state.populations['shore']['crab'].down).toBe(1);
    expect(due).toHaveLength(1);
    // Thirty seconds after it went down, whenever that was.
    expect(due[0] - secondsToMs(30)).toBeLessThanOrEqual(state.time);

    // Nothing else may swing over the wait, or a second crab going down would
    // be what moved the deficit.
    state.activeAction = null;
    state.location = 'camp';
    const at = due[0];
    resolve(state, registry, at - 1);
    expect(state.populations['shore']['crab'].down).toBe(1);

    resolve(state, registry, at);
    expect(state.populations['shore']?.['crab']?.down ?? 0).toBe(0);
  });

  // A due time is fixed when the copy goes down, so waiting through a respawn
  // rolls the same numbers as not waiting.
  it('draws no randomness at spawn time', () => {
    const registry = loaded();
    const state = standing(registry, 'shore');
    armFightAction('swing', 'crab', registry, state);
    resolve(state, registry, secondsToMs(3));
    const at = state.populations['shore']['crab'].due[0];

    state.activeAction = null;
    state.location = 'camp';
    const before = state.rng;
    resolve(state, registry, at);
    expect(state.populations['shore']?.['crab']?.down ?? 0).toBe(0);
    expect(state.rng).toBe(before);
  });

  it('leaves a copy with no respawn after: down for good', () => {
    const registry = loaded();
    const state = standing(registry, 'camp');
    armFightAction('swing', 'bandit-leader', registry, state);
    resolve(state, registry, secondsToMs(4));

    resolve(state, registry, state.time + secondsToMs(600));
    expect(state.populations['camp']['bandit-leader']).toEqual({ down: 1, due: [] });
  });
});

describe('an overload bounds and ends the action it overlays', () => {
  // What SWINGS and what ENDS the action have to be the same copy, or an
  // overload governs half of its own entity's performance.
  const patient = MODULE.replace('# entity player', ['# entity player', 'swing:', '  attempts: 2', '  on unfinished:', '    set: gave-up'].join(String.fromCharCode(10)));

  it('reads attempts: and on unfinished: off the copy that swings', () => {
    // The ogre carries 1000 health against 4 a hit and opens nothing itself, so
    // nothing here completes and nothing re-arms: what ends it is the
    // overload's own bound.
    const registry = loadInEnglish(patient);
    const overloaded = standing(registry, 'camp');
    armFightAction('swing', 'ogre', registry, overloaded);
    resolve(overloaded, registry, secondsToMs(10));

    expect(overloaded.flags['gave-up']).toBe(true);
    expect(overloaded.activeAction).toBeNull();

    const plain = loaded();
    const control = standing(plain, 'camp');
    armFightAction('swing', 'ogre', plain, control);
    resolve(control, plain, secondsToMs(10));
    expect(control.flags['gave-up']).toBeUndefined();
    expect(control.activeAction).not.toBeNull();
  });
});

describe('a fight nobody can swing in is no fight', () => {
  // `hidden if:` closing over every seat used to leave the action armed with
  // no participant, which is a stall rather than an end.
  it('ends rather than stalling when every seat gate has closed', () => {
    // No ally, so the boulder's gated seat and the player's are the whole
    // roster; taking the player's clock away leaves nobody at all.
    const registry = loadInEnglish(MODULE.replace(`uses: swing${String.fromCharCode(10)}allies: miki`, 'uses: swing'));
    const state = standing(registry, 'camp');
    state.flags['truce'] = true;
    armFightAction('swing', 'boulder', registry, state);
    expect(Object.keys(state.activeAction!.cadences)).toEqual([PLAYER]);
    delete state.activeAction!.cadences[PLAYER];

    resolve(state, registry, secondsToMs(5));
    expect(state.activeAction).toBeNull();
    expect(state.time).toBe(secondsToMs(5));
  });
});

describe('allies: names somebody else', () => {
  const withAlly = (line: string): string => MODULE.replace('# entity bandit\nfaction: bandits', `# entity bandit\nfaction: bandits\n${line}`);

  it('refuses an entity that names itself, or the player, as its own ally', () => {
    expect(() => loadInEnglish(withAlly('allies: bandit'))).toThrow(/allies: names this entity itself/);
    expect(() => loadInEnglish(withAlly('allies: player'))).toThrow(/allies: names the player/);
    expect(() => loadInEnglish(withAlly('allies: miki'))).not.toThrow();
  });
});

describe('the populations save field', () => {
  it('survives a round trip and is pruned when the place or the thing leaves', () => {
    const registry = loaded();
    const state = standing(registry, 'shore');
    armFightAction('swing', 'crab', registry, state);
    resolve(state, registry, secondsToMs(3));

    const diff = diffState(state, initialState(registry));
    const restored = createGameState();
    loadSave(restored, { version: SAVE_VERSION, diff }, registry);
    expect(restored.populations).toEqual(state.populations);

    const withoutShore = loadInEnglish(MODULE.split('\n# location shore')[0]);
    const pruned = createGameState();
    const warnings = loadSave(pruned, { version: SAVE_VERSION, diff: { populations: { shore: { crab: { down: 1, due: [] } } } } }, withoutShore);
    expect(pruned.populations).toEqual({});
    expect(warnings.map((warning) => warning.path)).toEqual(['populations.shore.crab']);
  });

  it('refuses a shape that is not a deficit rather than misreading it at first use', () => {
    for (const bad of [{ shore: { crab: { down: -1, due: [] } } }, { shore: { crab: { down: 1, due: [1.5] } } }, { shore: { crab: { down: 0, due: [1, 2] } } }, { shore: { crab: 3 } }, [{}]]) {
      expect(isPopulations(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isPopulations({ shore: { crab: { down: 2, due: [1000] } } })).toBe(true);

    const registry = loaded();
    const state = createGameState();
    expect(() => loadSave(state, { version: SAVE_VERSION, diff: { populations: { shore: { crab: { down: 'lots' } } } } as never }, registry)).toThrow(/save field populations/);
  });
});

// Four patterns cover three cases; a swing whose swinger and target are the
// same player is the fourth, and before pass 2 the localizer threw for want of
// a {target} rather than saying anything at all.
describe('a swing the player lands on themselves', () => {
  it('is said the way one between two others is, rather than refused', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);

    logSwing(state, registry, PLAYER, PLAYER, toMilliUnits(3));
    logSwing(state, registry, PLAYER, PLAYER, null);

    expect(state.log).toEqual(['The Player hits the Player for 3.', 'The Player misses the Player.']);
  });
});
