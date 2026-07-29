import { describe, expect, it } from 'vitest';
import { restorePools } from './effects';
import { createGameState, PLAYER } from './runtime';
import { loadModule } from '../content/registry';
import { compareSave, diffState, initialState, loadSave, pruneStateForRegistry, SAVE_VERSION, serializeSave } from './save';
import { parseSaveSection } from '../content/saveSection';
import { runTest } from './session';

const MODULE = `
# location camp
x: 0, y: 0
starting

# item gold
title: Gold

# flag done

# stat max-health
base: 10

# resource health
max: max-health

# entity chest
open:
  give: 1 gold
`;

describe('initialState', () => {
  it('places a fresh game at the registry starting location, like startSession', () => {
    const registry = loadModule(MODULE);
    expect(initialState(registry).location).toBe('camp');
  });
});

describe('diffState', () => {
  it('is empty for a fresh state against the baseline', () => {
    const registry = loadModule(MODULE);
    const baseline = initialState(registry);
    const state = initialState(registry);
    expect(diffState(state, baseline)).toEqual({});
  });

  it('captures only the inventory entry that changed', () => {
    const registry = loadModule(MODULE);
    const baseline = initialState(registry);
    const state = initialState(registry);
    state.inventory.bread = 1;
    expect(diffState(state, baseline)).toEqual({ inventory: { bread: 1 } });
  });

  it('captures only location on a relocation', () => {
    const registry = loadModule(MODULE);
    const baseline = initialState(registry);
    const state = initialState(registry);
    state.location = 'elsewhere';
    expect(diffState(state, baseline)).toEqual({ location: 'elsewhere' });
  });
});

describe('serializeSave', () => {
  it('is single-line JSON carrying the version and only the changed fields', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    state.inventory.bread = 2;
    const serialized = serializeSave(state, registry);
    expect(serialized.includes('\n')).toBe(false);
    expect(JSON.parse(serialized)).toEqual({ version: SAVE_VERSION, inventory: { bread: 2 } });
  });

  it('serializes a fresh game as just the version', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    expect(JSON.parse(serializeSave(state, registry))).toEqual({ version: SAVE_VERSION });
  });
});

describe('loadSave', () => {
  it('round-trips through serialize -> parseSaveSection -> loadSave', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    state.inventory.gold = 3;
    state.flags.done = true;
    restorePools(state, { health: 4 }); // a damaged pool must survive the round trip, not reset to full
    const serialized = serializeSave(state, registry);
    expect(JSON.parse(serialized).resources).toEqual({ health: 4 });

    const { saved } = parseSaveSection({
      kind: 'save',
      id: 'x',
      body: [{ text: serialized, span: { start: 0, end: 0 }, children: [] }],
      span: { start: 0, end: 0 },
    });

    const target = createGameState();
    loadSave(target, saved, registry);

    const { log: _targetLog, ...targetRest } = target;
    const { log: _stateLog, ...stateRest } = state;
    expect(targetRest).toEqual(stateRest);
  });

  it('clears stale fields not present in the loaded save', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    state.location = 'camp';
    state.inventory.bread = 99;
    state.flags.stale = true;

    loadSave(state, { version: SAVE_VERSION, diff: {} }, registry);

    expect(state.location).toBe('camp');
    expect(state.inventory).toEqual({});
    expect(state.flags).toEqual({});
  });

  it('throws a clear error on a version mismatch', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    expect(() => loadSave(state, { version: SAVE_VERSION + 1, diff: {} }, registry)).toThrow(/version/);
  });
});

const PRUNE_MODULE = `
# location camp
x: 0, y: 0
starting
flags: lit

# location cave
x: 1, y: 0

# item bread

# flag known

# skill cooking

# stat max-health
base: 10

# stat strength
base: 1

# resource health
max: max-health

# dialogue miki
node hello:
  Hi.
`;

describe('pruneStateForRegistry', () => {
  it('removes state entries whose content ids are not loaded', () => {
    const registry = loadModule(PRUNE_MODULE);
    const state = initialState(registry);
    state.location = 'missing-camp';
    state.inventory.bread = 1;
    state.inventory['mod.gem'] = 2;
    state.flags.known = true;
    state.flags['camp.lit'] = true;
    state.flags['cave.discovered'] = true;
    state.flags['mod.flag'] = true;
    state.visits['miki.hello'] = 1;
    state.visits['mod.dialogue.hello'] = 3;
    state.xp.cooking = 4;
    state.xp.mining = 5;
    restorePools(state, { health: 6, mana: 7 });
    state.activeBuffs['bread:strength'] = { kind: 'added', statId: 'strength', amount: { min: 1, max: 1 }, expiresAt: 10 };
    state.activeBuffs['mod.meal:strength'] = { kind: 'added', statId: 'strength', amount: { min: 1, max: 1 }, expiresAt: 10 };
    state.activeBuffs['bread:agility'] = { kind: 'added', statId: 'agility', amount: { min: 1, max: 1 }, expiresAt: 10 };
    state.activeAction = {
      ownerRef: 'item.mod.gem',
      actionLabel: 'eat',
      repeating: false,
      healthRemaining: 1,
      cadences: { [PLAYER]: { progress: 0, attemptsMade: 0 } },
    };

    const warnings = pruneStateForRegistry(state, registry);

    expect(state.location).toBe('camp');
    expect(state.inventory).toEqual({ bread: 1 });
    expect(state.flags).toEqual({ known: true, 'camp.lit': true, 'cave.discovered': true });
    expect(state.visits).toEqual({ 'miki.hello': 1 });
    expect(state.xp).toEqual({ cooking: 4 });
    expect(state.resources).toEqual({ health: 6 });
    expect(Object.keys(state.activeBuffs)).toEqual(['bread:strength']);
    expect(state.activeAction).toBeNull();
    expect(warnings.map((warning) => warning.path)).toEqual(
      expect.arrayContaining([
        'location',
        'inventory.mod.gem',
        'flags.mod.flag',
        'visits.mod.dialogue.hello',
        'xp.mining',
        'resources.mana',
        'activeBuffs.mod.meal:strength',
        'activeBuffs.bread:agility',
        'activeAction',
      ]),
    );
  });

  it('keeps object-owned flags and map discovery, which live only in the namespace', () => {
    const registry = loadModule(PRUNE_MODULE);
    const state = initialState(registry);
    state.flags['camp.lit'] = true;
    state.flags['cave.discovered'] = true;
    const saved = { version: SAVE_VERSION, diff: diffState(state, initialState(registry)) };

    const target = createGameState();
    const warnings = loadSave(target, saved, registry);

    expect(warnings).toEqual([]);
    expect(target.flags).toEqual({ 'camp.lit': true, 'cave.discovered': true });
  });

  it('loadSave prunes restored stale ids and records quiet warnings in the transient log', () => {
    const registry = loadModule(PRUNE_MODULE);
    const state = createGameState();
    const warnings = loadSave(state, { version: SAVE_VERSION, diff: { inventory: { 'mod.gem': 2 }, flags: { 'mod.flag': true } } }, registry);

    expect(state.inventory).toEqual({});
    expect(state.flags).toEqual({});
    expect(warnings.map((warning) => warning.path)).toEqual(['inventory.mod.gem', 'flags.mod.flag']);
    expect(state.log).toEqual(warnings.map((warning) => warning.message));
  });
});

describe('compareSave', () => {
  it('returns no differences for a matching state', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    state.inventory.bread = 1;
    const saved = { version: SAVE_VERSION, diff: diffState(state, initialState(registry)) };
    expect(compareSave(state, saved, registry)).toEqual([]);
  });

  it('reports a human-readable mismatch', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    state.inventory.bread = 2;
    const saved = { version: SAVE_VERSION, diff: { inventory: { bread: 1 } } };
    expect(compareSave(state, saved, registry)).toEqual(['inventory.bread: 2 vs 1']);
  });

  it('reports a flag present in the save but absent from the state', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    const saved = { version: SAVE_VERSION, diff: { flags: { 'tutorial.quest-given': true } } };
    expect(compareSave(state, saved, registry)).toEqual(['flags.tutorial.quest-given: (absent) vs true']);
  });

  it('throws a clear error on a version mismatch', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    expect(() => compareSave(state, { version: SAVE_VERSION + 1, diff: {} }, registry)).toThrow(/version/);
  });
});

const SAVE_TEST_MODULE = `
# location camp
x: 0, y: 0
starting

# item gold
title: Gold

# entity chest
open:
  give: 1 gold

# save empty
{"version":4}

# test load-and-match
load: empty
expect: empty

# test load-then-diverge
load: empty
use: entity.chest.open
expect: empty
`;

describe('# save section wired through load: / expect: test directives', () => {
  it('passes when the loaded state still matches the save', () => {
    const registry = loadModule(SAVE_TEST_MODULE);
    const state = createGameState();
    expect(runTest('load-and-match', registry, state)).toEqual({ passed: true });
  });

  it('fails with a save-mismatch failure once state diverges after loading', () => {
    const registry = loadModule(SAVE_TEST_MODULE);
    const state = createGameState();
    const result = runTest('load-then-diverge', registry, state);
    expect(result.passed).toBe(false);
    expect(result.failure).toMatch(/^save mismatch empty:/);
    expect(result.failure).toMatch(/inventory\.gold/);
  });
});

describe('a # save body is checked past its version', () => {
  const registry = loadModule(PRUNE_MODULE);
  const load = (diff: Record<string, unknown>) => () => loadSave(createGameState(), { version: SAVE_VERSION, diff }, registry);

  it('refuses a scalar of the wrong type', () => {
    expect(load({ time: 'potato' })).toThrow(/save field time holds "potato"/);
    expect(load({ location: 3 })).toThrow(/save field location holds 3/);
  });

  it('refuses a record written as anything but an object of ids', () => {
    expect(load({ flags: 'known' })).toThrow(/save field flags must be an object of ids/);
    expect(load({ inventory: ['bread'] })).toThrow(/save field inventory must be an object of ids/);
  });

  it('refuses a record member of the wrong type', () => {
    expect(load({ inventory: { bread: 'lots' } })).toThrow(/save field inventory\.bread holds "lots"/);
  });

  it('refuses a field the engine does not keep', () => {
    expect(load({ inventroy: {} })).toThrow(/save holds an unknown field: inventroy/);
  });

  it('still accepts every field written correctly', () => {
    expect(load({ time: 3, location: 'camp', flags: { known: true }, inventory: { bread: 2 } })).not.toThrow();
  });
});
