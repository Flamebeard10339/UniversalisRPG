import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/registry';
import {
  collapseInstance,
  createInstance,
  defineInstanceKind,
  instance,
  instanceIsLive,
  isInstanceTable,
  removeInstance,
} from './instances';
import { nextRandom } from './rng';
import { createGameState } from './state';
import { initialState, loadSave, pruneStateForRegistry, SAVE_VERSION, serializeSave } from './save';
import { parseSaveSection } from '../content/saveSection';

const MODULE = `
# location camp
x: 0, y: 0
starting

# item charm
title: Charm

# item token
title: Token

# stat might
base: 3
`;

// A payload the substrate has no idea about, standing in for the two real ones
// that do not exist yet. It names a registry declaration and other instances,
// which is every way a payload can go stale, and it is registered here so no
// shipped content can reach it.
interface Token {
  notes: string[];
  stat: string | null;
  linked: string[];
}

const TOKEN = 'test-token';

const isStrings = (value: unknown): boolean => Array.isArray(value) && value.every((each) => typeof each === 'string');

defineInstanceKind<Token>(TOKEN, {
  templateLoaded: (registry, template) => registry.items.has(template),
  holds: (payload) => {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
    const token = payload as Record<string, unknown>;
    return isStrings(token.notes) && isStrings(token.linked) && (token.stat === null || typeof token.stat === 'string');
  },
  empty: (payload) => payload.notes.length === 0 && payload.stat === null && payload.linked.length === 0,
  repair: (payload, registry, live) => {
    const repairs: string[] = [];
    if (payload.stat !== null && !registry.stats.has(payload.stat)) {
      repairs.push(`dropped stat ${payload.stat}, which is not loaded`);
      payload.stat = null;
    }
    for (const ref of [...payload.linked]) {
      if (live(ref)) continue;
      repairs.push(`dropped link to instance ${ref}, which is gone`);
      payload.linked.splice(payload.linked.indexOf(ref), 1);
    }
    return repairs;
  },
});

function token(over: Partial<Token> = {}): Token {
  return { notes: [], stat: null, linked: [], ...over };
}

function parse(serialized: string): { version: number; diff: Record<string, unknown> } {
  return parseSaveSection({
    kind: 'save',
    id: 'x',
    body: [{ text: serialized, span: { start: 0, end: 0 }, children: [] }],
    span: { start: 0, end: 0 },
  }).saved;
}

describe('creating an instance', () => {
  it('refuses a payload recording nothing, so no instance carries nothing', () => {
    const state = createGameState();
    expect(() => createInstance(state, TOKEN, 'charm', token())).toThrow(/recording nothing/);
    expect(state.instances.byId).toEqual({});
  });

  it('refuses a payload its kind does not keep, and a kind nothing registered', () => {
    const state = createGameState();
    expect(() => createInstance(state, TOKEN, 'charm', { notes: 'worn' })).toThrow(/does not keep/);
    expect(() => createInstance(state, 'no-such-kind', 'charm', token({ notes: ['worn'] }))).toThrow(/unknown instance kind/);
  });

  it('draws no randomness, so a session that makes one rolls what a session that does not rolls', () => {
    const withInstance = createGameState();
    const without = createGameState();
    createInstance(withInstance, TOKEN, 'charm', token({ notes: ['worn'] }));
    expect(nextRandom(withInstance)).toBe(nextRandom(without));
    expect(withInstance.rng).toBe(without.rng);
  });

  it('never answers a removed id with a later instance', () => {
    const state = createGameState();
    const first = createInstance(state, TOKEN, 'charm', token({ notes: ['first'] }));
    removeInstance(state, first);
    const second = createInstance(state, TOKEN, 'charm', token({ notes: ['second'] }));
    expect(second).not.toBe(first);
    expect(instanceIsLive(state, first)).toBe(false);
  });
});

describe('liveness is answered in one place', () => {
  it('answers for a minted id, and stops answering once it is gone', () => {
    const state = createGameState();
    const id = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));
    expect(instanceIsLive(state, id)).toBe(true);
    expect(instance(state, id)?.template).toBe('charm');

    expect(removeInstance(state, id)).toBe(true);
    expect(instanceIsLive(state, id)).toBe(false);
    expect(instance(state, id)).toBeUndefined();
    expect(removeInstance(state, id)).toBe(false);
  });

  it('collapses a copy whose payload has emptied, and only then', () => {
    const state = createGameState();
    const id = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));
    expect(collapseInstance(state, id)).toBe(false);

    instance(state, id)!.payload = token();
    expect(collapseInstance(state, id)).toBe(true);
    expect(instanceIsLive(state, id)).toBe(false);
  });
});

describe('an instance across a save round trip', () => {
  it('comes back with the same id and the same payload', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    const id = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'], stat: 'might' }));

    const target = createGameState();
    loadSave(target, parse(serializeSave(state, registry)), registry);

    expect(target.instances).toEqual(state.instances);
    expect(instance(target, id)).toEqual({ kind: TOKEN, template: 'charm', payload: { notes: ['worn'], stat: 'might', linked: [] } });
  });

  it('is absent from a save that has none, and does not move SAVE_VERSION', () => {
    const registry = loadModule(MODULE);
    const serialized = JSON.parse(serializeSave(initialState(registry), registry));
    expect(serialized).toEqual({ version: SAVE_VERSION });

    const target = createGameState();
    target.instances = { next: 9, byId: {} };
    loadSave(target, { version: SAVE_VERSION, diff: {} }, registry);
    expect(target.instances).toEqual({ next: 1, byId: {} });
  });

  it('keeps a counter that has run on past the instances it minted', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    removeInstance(state, createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] })));

    const target = createGameState();
    loadSave(target, parse(serializeSave(state, registry)), registry);
    expect(target.instances).toEqual({ next: 2, byId: {} });
  });
});

describe('a # save body holding nonsense in the instance table', () => {
  const registry = loadModule(MODULE);
  const load = (instances: unknown) => () => loadSave(createGameState(), { version: SAVE_VERSION, diff: { instances } }, registry);

  it('refuses a table that is not one', () => {
    for (const body of [3, null, [], { byId: {} }, { next: 1 }, { next: 1.5, byId: {} }, { next: 1, byId: [] }]) {
      expect(load(body), JSON.stringify(body)).toThrow(/save field instances holds/);
    }
  });

  it('refuses a row that is not an instance', () => {
    for (const held of [3, null, { template: 'charm', payload: {} }, { kind: TOKEN, payload: {} }, { kind: TOKEN, template: 'charm' }]) {
      expect(load({ next: 2, byId: { 1: held } }), JSON.stringify(held)).toThrow(/save field instances holds/);
    }
  });

  it('refuses an id no counter could have minted, which would collide with a real one', () => {
    const row = { kind: TOKEN, template: 'charm', payload: token({ notes: ['worn'] }) };
    for (const id of ['2', '01', 'x', '-1', '1.0']) {
      expect(load({ next: 2, byId: { [id]: row } }), id).toThrow(/save field instances holds/);
    }
    expect(load({ next: 2, byId: { 1: row } })).not.toThrow();
  });

  it('refuses a payload the kind that owns it does not keep', () => {
    expect(load({ next: 2, byId: { 1: { kind: TOKEN, template: 'charm', payload: { notes: 'worn' } } } })).toThrow(/save field instances holds/);
  });

  it('accepts a payload whose kind nothing registered, because that is stale rather than malformed', () => {
    expect(isInstanceTable({ next: 2, byId: { 1: { kind: 'kind-from-a-module-not-loaded', template: 'charm', payload: 7 } } })).toBe(true);
  });
});

describe('content moving underneath an instance', () => {
  const WITHOUT_CHARM = MODULE.replace('# item charm\ntitle: Charm\n', '');

  it('prunes the instance whose template is gone, and warns like every other prune', () => {
    const state = initialState(loadModule(MODULE));
    const id = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));

    const warnings = pruneStateForRegistry(state, loadModule(WITHOUT_CHARM));
    expect(warnings).toContainEqual({ path: `instances.${id}`, id, message: `Removed instance ${id} because its template charm is not loaded.` });
    expect(instanceIsLive(state, id)).toBe(false);
  });

  it('prunes an instance whose payload kind nothing registered', () => {
    const state = initialState(loadModule(MODULE));
    state.instances = { next: 2, byId: { 1: { kind: 'kind-from-a-module-not-loaded', template: 'charm', payload: 7 } } };

    const warnings = pruneStateForRegistry(state, loadModule(MODULE));
    expect(warnings.map((warning) => warning.message)).toEqual(['Removed instance 1 because kind-from-a-module-not-loaded is not an instance kind this engine knows.']);
    expect(state.instances.byId).toEqual({});
  });

  it('repairs a payload whose own declaration is gone, through the kind that owns it', () => {
    const state = initialState(loadModule(MODULE));
    const id = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'], stat: 'might' }));

    const warnings = pruneStateForRegistry(state, loadModule(MODULE.replace('# stat might\nbase: 3\n', '')));
    expect(warnings).toContainEqual({ path: `instances.${id}`, id, message: `Repaired instance ${id}: dropped stat might, which is not loaded.` });
    expect(instance(state, id)!.payload).toEqual({ notes: ['worn'], stat: null, linked: [] });
  });

  it('repairs a reference to a pruned instance in the same pass that prunes it', () => {
    const state = initialState(loadModule(MODULE));
    const doomed = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));
    const holder = createInstance(state, TOKEN, 'token', token({ notes: ['holds one'], linked: [doomed] }));

    const warnings = pruneStateForRegistry(state, loadModule(WITHOUT_CHARM));
    expect(instanceIsLive(state, doomed)).toBe(false);
    expect(instance(state, holder)!.payload).toEqual({ notes: ['holds one'], stat: null, linked: [] });
    expect(warnings.map((warning) => warning.message)).toEqual([
      `Removed instance ${doomed} because its template charm is not loaded.`,
      `Repaired instance ${holder}: dropped link to instance ${doomed}, which is gone.`,
    ]);
  });

  it('drops a copy a repair left recording nothing, and follows the reference that strands', () => {
    const state = initialState(loadModule(MODULE));
    const doomed = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));
    const middle = createInstance(state, TOKEN, 'token', token({ linked: [doomed] }));
    const outer = createInstance(state, TOKEN, 'token', token({ linked: [middle] }));

    pruneStateForRegistry(state, loadModule(WITHOUT_CHARM));
    expect(state.instances.byId).toEqual({});
    expect([doomed, middle, outer].map((id) => instanceIsLive(state, id))).toEqual([false, false, false]);
  });

  it('leaves a loaded state holding no reference to an instance that is gone', () => {
    const registry = loadModule(MODULE);
    const state = initialState(registry);
    const doomed = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));
    createInstance(state, TOKEN, 'token', token({ notes: ['holds one'], linked: [doomed] }));

    const target = createGameState();
    const warnings = loadSave(target, parse(serializeSave(state, registry)), loadModule(WITHOUT_CHARM));

    expect(warnings.length).toBe(2);
    expect(Object.values(target.instances.byId).flatMap((held) => (held.payload as Token).linked)).toEqual([]);
    expect(target.log).toEqual(warnings.map((warning) => warning.message));
  });
});
