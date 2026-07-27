import { describe, expect, it } from 'vitest';
import { createGameState, loadModule } from './runtime';
import { compareSave, diffState, initialState, loadSave, parseSaveSection, SAVE_VERSION, serializeSave } from './save';
import { runTest } from './session';

const MODULE = `
# location camp
x: 0, y: 0
starting

# item gold
title: Gold

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
    state.inventory.bread = 3;
    state.flags['tutorial.done'] = true;
    const serialized = serializeSave(state, registry);

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
{"version":1}

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
