import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import {
  collapseInstance,
  createInstance,
  defineInstanceKind,
  instance,
  instanceIsLive,
  isInstanceTable,
  removeInstance,
} from './instances';
import { anId, type Said } from './said';
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
    const repairs: Said[] = [];
    if (payload.stat !== null && !registry.stats.has(payload.stat)) {
      repairs.push(anId(`dropped stat ${payload.stat}, which is not loaded`));
      payload.stat = null;
    }
    for (const ref of [...payload.linked]) {
      if (live(ref)) continue;
      repairs.push(anId(`dropped link to instance ${ref}, which is gone`));
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

  // c1: the ordinal is a counter reading and nothing else, so it is the one
  // thing about a copy that no later edit to the copy can move. Rewriting the
  // template through the table is what a transform would do; the copy answers
  // to the same ordinal on the far side of it.
  it('mints an ordinal that does not encode what the copy is of, and keeps it when that changes', () => {
    const state = createGameState();
    const charm = createInstance(state, TOKEN, 'charm', token({ notes: ['first'] }));
    const relic = createInstance(state, TOKEN, 'relic', token({ notes: ['second'] }));
    expect([charm, relic]).toEqual(['1', '2']);

    (state.instances.byId[charm] as { template: string }).template = 'relic';
    expect(instance(state, charm)).toEqual({ kind: TOKEN, template: 'relic', payload: token({ notes: ['first'] }) });
    expect(createInstance(state, TOKEN, 'charm', token({ notes: ['third'] }))).toBe('3');
  });

  // The counters a `# save` may carry and the ones a mint may advance are one
  // set on purpose, so the two tests below are the same property from each end:
  // no accepted table mints a collision, and no mint leaves the accepted set.
  it('mints a distinct id from every counter a save is allowed to carry', () => {
    const registry = loadInEnglish(MODULE);
    for (const next of [0, 1, Number.MAX_SAFE_INTEGER - 2]) {
      const state = createGameState();
      loadSave(state, { version: SAVE_VERSION, diff: { instances: { next, byId: {} } } }, registry);
      const first = createInstance(state, TOKEN, 'charm', token({ notes: ['first'] }));
      const second = createInstance(state, TOKEN, 'charm', token({ notes: ['second'] }));

      expect(second, String(next)).not.toBe(first);
      expect(Object.keys(state.instances.byId), String(next)).toEqual([first, second]);
      expect(instance(state, first)!.payload, String(next)).toEqual(token({ notes: ['first'] }));
    }
  });

  it('never writes a save it would refuse to load, and refuses to mint rather than break that', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    loadSave(state, { version: SAVE_VERSION, diff: { instances: { next: Number.MAX_SAFE_INTEGER - 1, byId: {} } } }, registry);
    createInstance(state, TOKEN, 'charm', token({ notes: ['the last one'] }));

    const written = serializeSave(state, registry);
    expect(() => loadSave(createGameState(), parse(written), registry)).not.toThrow();
    expect(() => createInstance(state, TOKEN, 'charm', token({ notes: ['one too many'] }))).toThrow(/cannot advance without minting one id twice/);
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

    (instance(state, id)!.payload as Token).notes.pop();
    expect(collapseInstance(state, id)).toBe(true);
    expect(instanceIsLive(state, id)).toBe(false);
  });
});

describe('an instance across a save round trip', () => {
  it('comes back with the same id and the same payload', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    const id = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'], stat: 'might' }));

    const target = createGameState();
    loadSave(target, parse(serializeSave(state, registry)), registry);

    expect(target.instances).toEqual(state.instances);
    expect(instance(target, id)).toEqual({ kind: TOKEN, template: 'charm', payload: { notes: ['worn'], stat: 'might', linked: [] } });
  });

  it('is absent from a save that has none, and does not move SAVE_VERSION', () => {
    const registry = loadInEnglish(MODULE);
    const serialized = JSON.parse(serializeSave(initialState(registry), registry));
    expect(serialized).toEqual({ version: SAVE_VERSION });

    const target = createGameState();
    target.instances = { next: 9, byId: {} };
    loadSave(target, { version: SAVE_VERSION, diff: {} }, registry);
    expect(target.instances).toEqual({ next: 1, byId: {} });
  });

  it('keeps a counter that has run on past the instances it minted', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    removeInstance(state, createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] })));

    const target = createGameState();
    loadSave(target, parse(serializeSave(state, registry)), registry);
    expect(target.instances).toEqual({ next: 2, byId: {} });
  });
});

describe('a # save body holding nonsense in the instance table', () => {
  const registry = loadInEnglish(MODULE);
  const load = (instances: unknown) => () => loadSave(createGameState(), { version: SAVE_VERSION, diff: { instances } }, registry);

  it('refuses a table that is not one', () => {
    for (const body of [3, null, [], { byId: {} }, { next: 1 }, { next: 1.5, byId: {} }, { next: 1, byId: [] }]) {
      expect(load(body), JSON.stringify(body)).toThrow(/save field instances holds/);
    }
  });

  it('refuses a counter that could not spell a legal id next', () => {
    for (const next of [-1, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, '3']) {
      expect(load({ next, byId: {} }), String(next)).toThrow(/save field instances holds/);
    }
    for (const next of [0, 1, Number.MAX_SAFE_INTEGER]) {
      expect(load({ next, byId: {} }), String(next)).not.toThrow();
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
    const state = initialState(loadInEnglish(MODULE));
    const id = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));

    const warnings = pruneStateForRegistry(state, loadInEnglish(WITHOUT_CHARM));
    expect(warnings).toContainEqual({ path: `instances.${id}`, id, message: `Removed instance ${id} because its template charm is not loaded.` });
    expect(instanceIsLive(state, id)).toBe(false);
  });

  it('prunes an instance whose payload kind nothing registered', () => {
    const state = initialState(loadInEnglish(MODULE));
    state.instances = { next: 2, byId: { 1: { kind: 'kind-from-a-module-not-loaded', template: 'charm', payload: 7 } } };

    const warnings = pruneStateForRegistry(state, loadInEnglish(MODULE));
    expect(warnings.map((warning) => warning.message)).toEqual(['Removed instance 1 because kind-from-a-module-not-loaded is not an instance kind this engine knows.']);
    expect(state.instances.byId).toEqual({});
  });

  it('drops a copy a # save wrote already recording nothing, the one route past the refusal at the mint', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    const row = { kind: TOKEN, template: 'charm', payload: token() };

    const warnings = loadSave(state, { version: SAVE_VERSION, diff: { instances: { next: 2, byId: { 1: row } } } }, registry);
    expect(warnings.map((warning) => warning.message)).toEqual(['Removed instance 1 because nothing is left recorded about it.']);
    expect(state.instances).toEqual({ next: 2, byId: {} });
  });

  it('repairs a payload whose own declaration is gone, through the kind that owns it', () => {
    const state = initialState(loadInEnglish(MODULE));
    const id = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'], stat: 'might' }));

    const warnings = pruneStateForRegistry(state, loadInEnglish(MODULE.replace('# stat might\nbase: 3\n', '')));
    expect(warnings).toContainEqual({ path: `instances.${id}`, id, message: `Repaired instance ${id}: dropped stat might, which is not loaded.` });
    expect(instance(state, id)!.payload).toEqual({ notes: ['worn'], stat: null, linked: [] });
  });

  it('repairs a reference to a pruned instance in the same pass that prunes it', () => {
    const state = initialState(loadInEnglish(MODULE));
    const doomed = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));
    const holder = createInstance(state, TOKEN, 'token', token({ notes: ['holds one'], linked: [doomed] }));

    const warnings = pruneStateForRegistry(state, loadInEnglish(WITHOUT_CHARM));
    expect(instanceIsLive(state, doomed)).toBe(false);
    expect(instance(state, holder)!.payload).toEqual({ notes: ['holds one'], stat: null, linked: [] });
    expect(warnings.map((warning) => warning.message)).toEqual([
      `Removed instance ${doomed} because its template charm is not loaded.`,
      `Repaired instance ${holder}: dropped link to instance ${doomed}, which is gone.`,
    ]);
  });

  it('drops a copy a repair left recording nothing, and follows the reference that strands', () => {
    const state = initialState(loadInEnglish(MODULE));
    const doomed = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));
    const middle = createInstance(state, TOKEN, 'token', token({ linked: [doomed] }));
    const outer = createInstance(state, TOKEN, 'token', token({ linked: [middle] }));

    pruneStateForRegistry(state, loadInEnglish(WITHOUT_CHARM));
    expect(state.instances.byId).toEqual({});
    expect([doomed, middle, outer].map((id) => instanceIsLive(state, id))).toEqual([false, false, false]);
  });

  it('reports a repair once however many rounds the table takes to settle', () => {
    const state = initialState(loadInEnglish(MODULE));
    // Minted against the iteration order on purpose: outer is walked before
    // the middle it points at empties, so its own repair cannot happen until a
    // second round — and the survivor is walked in both of them.
    const survivor = createInstance(state, TOKEN, 'token', token({ notes: ['outlives it'] }));
    const outer = createInstance(state, TOKEN, 'token', token({ notes: ['outlives it too'] }));
    const doomed = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));
    const middle = createInstance(state, TOKEN, 'token', token({ linked: [doomed] }));
    (instance(state, outer)!.payload as Token).linked.push(middle);
    (instance(state, survivor)!.payload as Token).linked.push(doomed);

    const warnings = pruneStateForRegistry(state, loadInEnglish(WITHOUT_CHARM));
    expect(Object.keys(state.instances.byId)).toEqual([survivor, outer]);
    expect((instance(state, outer)!.payload as Token).linked).toEqual([]);
    expect(warnings.filter((warning) => warning.id === survivor)).toEqual([
      { path: `instances.${survivor}`, id: survivor, message: `Repaired instance ${survivor}: dropped link to instance ${doomed}, which is gone.` },
    ]);
  });

  it('settles the table before any other rule runs, so a field holding an id asks an answer that is final', () => {
    const state = initialState(loadInEnglish(MODULE));
    state.inventory.charm = 2;
    const id = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));

    const warnings = pruneStateForRegistry(state, loadInEnglish(WITHOUT_CHARM));
    expect(warnings.map((warning) => warning.path)).toEqual([`instances.${id}`, 'inventory.charm']);
  });

  it('leaves a loaded state holding no reference to an instance that is gone', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    const doomed = createInstance(state, TOKEN, 'charm', token({ notes: ['worn'] }));
    createInstance(state, TOKEN, 'token', token({ notes: ['holds one'], linked: [doomed] }));

    const target = createGameState();
    const warnings = loadSave(target, parse(serializeSave(state, registry)), loadInEnglish(WITHOUT_CHARM));

    expect(warnings.length).toBe(2);
    expect(Object.values(target.instances.byId).flatMap((held) => (held.payload as Token).linked)).toEqual([]);
    expect(target.log).toEqual(warnings.map((warning) => warning.message));
  });
});
