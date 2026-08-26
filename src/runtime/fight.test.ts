import { describe, expect, it } from 'vitest';
import { armFightAction, createGameState, GameState, initResources, PLAYER, resolve, resolveUnderWay, UNDER_WAY_LIMIT_HOURS, UNDER_WAY_LIMIT_MS, WaitedOut } from './runtime';
import { condition } from '../grammar/condition';
import { parseWhole } from '../grammar/parser';
import { hostile, Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { diffState, initialState, loadSave, SAVE_VERSION } from './save';
import { logSwing } from './encounter';
import { declaredId } from '../content/sections/entity';
import { localizerOf } from './localized';
import { isPopulations } from './population';
import { secondsToMs, toMilliUnits } from './units';

const MODULE =
  FIXTURE_WORLD +
  `
# stat dr

# stat attack-rate
base: 60

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
    resolve(state, registry, secondsToMs(4));

    expect(state.activeAction).toBeNull();
    expect(state.inventory['token']).toBe(1);
    expect(state.populations['camp']['bandit-leader']).toEqual({ down: 1, due: [] });
    expect(state.log.some((line) => /^The Miki hits the Bandit Leader for /.test(line))).toBe(true);
    expect(state.log.some((line) => /^The Miki hits you/.test(line))).toBe(false);
  });

  it('answers an event on a fight-scoped copy, which has no entry in the registry of its own', () => {
    const registry = loaded();
    const state = standing(registry, 'camp');
    armFightAction('swing', 'bandit-leader', registry, state);

    expect(registry.entities.has('bandit#1')).toBe(false);
    state.activeAction!.actors!['bandit#1'].resources['health'] = toMilliUnits(1);
    state.activeAction!.roster![PLAYER].target = 'bandit#1';
    resolve(state, registry, secondsToMs(1));
    expect(state.inventory['bandit-ear']).toBe(1);
  });
});

describe('an overload governs its own entity performance', () => {
  it('is what swings, so its damage: and rate: are the ones that land', () => {
    const registry = loaded();
    const state = standing(registry, 'camp');
    armFightAction('swing', 'ogre', registry, state);

    resolve(state, registry, secondsToMs(2));
    expect(toMilliUnits(1000) - state.resources['health']).toBe(toMilliUnits(40));
  });

  it('replaces what it names bare and adds to what it names with +', () => {
    const registry = loaded();
    const declaration = registry.actions.get('swing')!;
    const overloaded = registry.entities.get('ogre')!.actions[0];

    expect(declaration.damage).toEqual({ left: { side: 'my', id: 'attack' }, right: { side: 'their', id: 'dr' } });
    expect(overloaded.damage).toEqual({ left: { side: 'my', id: 'hard-blow' }, right: { side: 'their', id: 'dr' } });
    expect(overloaded.depletes).toEqual(declaration.depletes);
  });

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

    expect(gated.resources['health']).toBe(toMilliUnits(1000));
    expect(open.resources['health']).toBeLessThan(toMilliUnits(1000));
  });
});

describe('respawn after: is the thing own fact, and the count is the place own', () => {
  it('brings a copy back at its due instant and not before', () => {
    const registry = loaded();
    const state = standing(registry, 'shore');
    armFightAction('swing', 'crab', registry, state);
    resolve(state, registry, secondsToMs(3));

    const due = state.populations['shore']['crab'].due;
    expect(state.populations['shore']['crab'].down).toBe(1);
    expect(due).toHaveLength(1);
    expect(due[0] - secondsToMs(30)).toBeLessThanOrEqual(state.time);

    state.activeAction = null;
    state.location = 'camp';
    const at = due[0];
    resolve(state, registry, at - 1);
    expect(state.populations['shore']['crab'].down).toBe(1);

    resolve(state, registry, at);
    expect(state.populations['shore']?.['crab']?.down ?? 0).toBe(0);
  });

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
  const patient = MODULE.replace('# entity player', ['# entity player', 'swing:', '  attempts: 2', '  on unfinished:', '    set: gave-up'].join(String.fromCharCode(10)));

  it('reads attempts: and on unfinished: off the copy that swings', () => {
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
  it('ends rather than stalling when every seat gate has closed', () => {
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

describe('a foe going down is said', () => {
  // Every fight the module can seat, so a foe or an action added below is a subject with no edit here.
  function fellable(registry: Registry): Array<{ where: string; foe: string; action: string }> {
    const subjects: Array<{ where: string; foe: string; action: string }> = [];
    for (const location of registry.locations.values()) {
      for (const { entity: foe } of location.entities) {
        for (const action of registry.entities.get(foe)?.actions ?? []) {
          const id = declaredId(action);
          if (id === undefined || !action.depletes || action.requires !== undefined) continue;
          subjects.push({ where: location.id, foe, action: id });
        }
      }
    }
    return subjects;
  }

  it('names the fallen, in every fight that puts one down', () => {
    const registry = loaded();
    let announced = 0;

    for (const { where, foe, action } of fellable(registry)) {
      const state = standing(registry, where);
      armFightAction(action, foe, registry, state);
      resolve(state, registry, secondsToMs(20));
      if ((state.populations[where]?.[foe]?.down ?? 0) === 0) continue;

      const localizer = localizerOf(registry, state);
      const said = localizer.engine('engine.combat.felled', { target: localizer.title('entity', foe) });
      expect(said, 'the engine says nothing of its own for a fall').not.toBe('engine.combat.felled');
      expect(state.log, `${where}: ${foe} felled by ${action}`).toContain(said);
      announced++;
    }

    expect(announced, 'no fight in the module put anything down').toBeGreaterThan(0);
  });
});

describe('a swing the player lands on themselves', () => {
  it('is said the way one between two others is, rather than refused', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);

    logSwing(state, registry, PLAYER, PLAYER, toMilliUnits(3));
    logSwing(state, registry, PLAYER, PLAYER, null);

    expect(state.log).toEqual(['The Player hits the Player for 3.', 'The Player misses the Player.']);
  });
});

// The location never goes quiet on its own: what the player kills is back within a couple of
// seconds, so something is always standing for `aggressive` to open the next fight on. The player
// regenerates faster than a limpet can hurt them, so the death that legitimately stops a dangerous
// action never arrives either, and nothing is left to end the loop but the loop's own bound.
const TIDEPOOL =
  FIXTURE_WORLD +
  `
# stat dr

# stat attack-rate
base: 60

# stat regeneration
base: 600

# resource health
rate: regeneration
max: max-health

# event death
resource: health
trigger: on empty

# faction world

# faction player

# action swing
title: swing
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

# entity player
faction: player
stats: max-health 100, attack 4, attack-rate 60
uses: swing

# entity limpet
faction: world
stats: max-health 12, attack 4, attack-rate 60
uses: swing
aggressive
respawn after: 2s

# location camp
entities: 3 limpet
`;

describe('an action under way is bounded in the time of the world it runs in', () => {
  it('gives up on a room that respawns what it loses, rather than stepping it forever', () => {
    const registry = loadInEnglish(TIDEPOOL);
    const state = standing(registry, 'camp');
    resolve(state, registry, secondsToMs(1));
    expect(state.activeAction, 'nothing opened on the player, so there was never anything to wait out').not.toBeNull();

    const waited = resolveUnderWay(state, registry);

    expect(waited.ended, 'a room that never goes quiet was waited out to the end').toBe(false);
    expect(waited.reason).toContain(`${UNDER_WAY_LIMIT_HOURS} hours`);
    expect(state.time).toBeGreaterThanOrEqual(UNDER_WAY_LIMIT_MS);
    expect(state.activeAction, 'the world is still fighting where the loop left it').not.toBeNull();
    expect(state.resources['health'], 'the player was never the thing that stopped it').toBeGreaterThan(0);
  });

  it('leaves a fight that does end exactly where it ended, having spent none of the bound on it', () => {
    const registry = loadInEnglish(MODULE);
    const state = standing(registry, 'camp');
    armFightAction('swing', 'bandit-leader', registry, state);

    const waited = resolveUnderWay(state, registry);

    expect(waited).toEqual({ ended: true });
    expect(state.activeAction).toBeNull();
    expect(state.time).toBeLessThan(UNDER_WAY_LIMIT_MS);
  });
});

const FAINTS = `
# variable engagement-seconds
value: 0

# stat attack
base: 4

# stat dr

# stat attack-rate
base: 60

# stat regeneration

# stat max-health

# resource health
rate: regeneration
max: max-health

# event death
resource: health
trigger: on empty

# faction world

# faction player

# action swing
title: swing
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

# entity player
faction: player
stats: max-health 10, attack 1, attack-rate 60
uses: swing
on death:
  relocate: starting-location
  stop

# entity limpet
faction: world
stats: max-health 1000, attack 4, attack-rate 60
uses: swing
aggressive
respawn after: 2s

# location shore
x: 0, y: 0
starting
title: Shore

# location tidepool
x: 1, y: 0
title: Tidepool
entities: 3 limpet
`;

const STAYS_PUT = FAINTS.replace('  relocate: starting-location\n', '');

const fainting = (source: string): { waited: WaitedOut; state: GameState } => {
  const registry = loadInEnglish(source);
  const state = standing(registry, 'tidepool');
  resolve(state, registry, secondsToMs(1));
  expect(state.activeAction, 'the limpets never opened on the player, so there was nothing to wait out').not.toBeNull();
  return { waited: resolveUnderWay(state, registry), state };
};

describe('falling in a room that never goes quiet ends the sitting once fainting moves the player', () => {
  it('gives the loop back inside a minute where the same room without the move spends the whole four hours', () => {
    const moved = fainting(FAINTS);
    const pinned = fainting(STAYS_PUT);

    expect(moved.waited).toEqual({ ended: true });
    expect(moved.state.location, 'the reserved name landed the player on whichever location is marked starting').toBe('shore');
    expect(moved.state.time).toBeLessThan(secondsToMs(60));

    expect(pinned.waited.ended, 'standing still, the same fight is re-armed every tick and only the bound stops it').toBe(false);
    expect(pinned.state.time).toBeGreaterThanOrEqual(UNDER_WAY_LIMIT_MS);
    expect(pinned.state.location).toBe('tidepool');
  });
});

describe('a condition terminator that was never reached is a failure', () => {
  const until = (written: string): WaitedOut => {
    const registry = loadInEnglish(MODULE);
    const state = standing(registry, 'camp');
    armFightAction('swing', 'bandit-leader', registry, state);
    return resolveUnderWay(state, registry, parseWhole(condition, written, 0, 'a condition'));
  };

  it('fails on the condition the leader’s death never met, and passes on the one it did', () => {
    const met = until('has token');
    expect(met).toEqual({ ended: true });

    const short = until('gave-up');
    expect(short.ended).toBe(false);
    expect(short.reason, 'the reason names the condition that was asked for, not only what ran out').toContain('gave-up');
  });
});
